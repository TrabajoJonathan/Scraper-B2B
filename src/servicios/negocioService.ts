/**
 * negocioService — persistir el descubrimiento (Fase 1).
 *
 * Capa: servicios. Traduce `NegocioDescubierto` a filas, aplicando el dedup.
 *
 * Aquí se materializa el fix (a): un negocio hallado por N búsquedas es
 * **una fila en `negocios` + N filas en `prospecciones`**. La empresa es la
 * empresa; cada hallazgo es un intento distinto.
 */

import { enTransaccion, poolPostgres } from '../core/postgres.ts';
import { esProspectable } from './placesService.ts';
import type { NegocioDescubierto, SearchSpec } from '../dominio/tipos.ts';

/** Crea la fila de `busquedas`: el "por qué" de esta corrida (Vía B1). */
export async function registrarBusqueda(
  spec: SearchSpec,
  fuente: 'lista_jefe' | 'cerebro',
): Promise<string> {
  return enTransaccion(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into busquedas (producto, categoria, ubicacion, canal, fuente)
       values ($1, $2, $3, $4, $5) returning id`,
      [spec.producto, spec.categoria, spec.ubicacion, spec.canal, fuente],
    );
    return rows[0]!.id;
  });
}

export type ResultadoGuardado = {
  negociosNuevos: number;
  negociosActualizados: number;
  prospeccionesNuevas: number;
  prospeccionesRepetidas: number;
  /** Cerrados permanentemente: se guardan pero no se prospectan. */
  omitidosNoProspectables: number;
  /** Sin `place_id`: no se pueden deduplicar de forma confiable. */
  sinPlaceId: number;
};

/**
 * Guarda los negocios descubiertos y abre una prospección por cada uno.
 *
 * Idempotente: correr la misma búsqueda dos veces no duplica nada.
 *  - `negocios` se upsertea por `place_id` — y **se actualizan** los campos
 *    volátiles (rating y nº de reseñas cambian con el tiempo).
 *  - `prospecciones` tiene UNIQUE (negocio_id, busqueda_id) → el segundo
 *    intento no crea fila. NO se le pisa el estado: si ya iba en `enviado`,
 *    se queda en `enviado`.
 *
 * Todo va en una sola transacción: si algo falla a mitad, no queda una corrida
 * a medias que después nadie sabe interpretar.
 */
export async function guardarDescubrimiento(
  busquedaId: string,
  negocios: NegocioDescubierto[],
): Promise<ResultadoGuardado> {
  const r: ResultadoGuardado = {
    negociosNuevos: 0,
    negociosActualizados: 0,
    prospeccionesNuevas: 0,
    prospeccionesRepetidas: 0,
    omitidosNoProspectables: 0,
    sinPlaceId: 0,
  };

  await enTransaccion(async (c) => {
    for (const n of negocios) {
      let negocioId: string;

      if (n.place_id === null) {
        r.sinPlaceId += 1;
        const { rows } = await c.query<{ id: string }>(
          `insert into negocios
             (place_id, nombre, nombre_normalizado, dominio, sitio_web, telefono,
              direccion, categoria_google, rating, num_resenas, estado_negocio, url_maps)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           returning id`,
          [
            null, n.nombre, n.nombre_normalizado, n.dominio, n.sitio_web, n.telefono,
            n.direccion, n.categoria_google, n.rating, n.num_resenas, n.estado_negocio, n.url_maps,
          ],
        );
        negocioId = rows[0]!.id;
        r.negociosNuevos += 1;
      } else {
        // `xmax = 0` distingue INSERT de UPDATE en un upsert de Postgres.
        const { rows } = await c.query<{ id: string; fue_insert: boolean }>(
          `insert into negocios
             (place_id, nombre, nombre_normalizado, dominio, sitio_web, telefono,
              direccion, categoria_google, rating, num_resenas, estado_negocio, url_maps)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           on conflict (place_id) do update set
             nombre           = excluded.nombre,
             nombre_normalizado = excluded.nombre_normalizado,
             dominio          = excluded.dominio,
             sitio_web        = excluded.sitio_web,
             telefono         = excluded.telefono,
             direccion        = excluded.direccion,
             categoria_google = excluded.categoria_google,
             rating           = excluded.rating,
             num_resenas      = excluded.num_resenas,
             estado_negocio   = excluded.estado_negocio,
             url_maps         = excluded.url_maps
           returning id, (xmax = 0) as fue_insert`,
          [
            n.place_id, n.nombre, n.nombre_normalizado, n.dominio, n.sitio_web, n.telefono,
            n.direccion, n.categoria_google, n.rating, n.num_resenas, n.estado_negocio, n.url_maps,
          ],
        );
        negocioId = rows[0]!.id;
        if (rows[0]!.fue_insert) r.negociosNuevos += 1;
        else r.negociosActualizados += 1;
      }

      // Un local cerrado permanentemente se guarda (es un hecho) pero no se
      // prospecta: no tiene sentido escribirle.
      if (!esProspectable(n)) {
        r.omitidosNoProspectables += 1;
        continue;
      }

      const { rowCount } = await c.query(
        `insert into prospecciones (negocio_id, busqueda_id)
         values ($1, $2)
         on conflict (negocio_id, busqueda_id) do nothing`,
        [negocioId, busquedaId],
      );
      if (rowCount === 1) r.prospeccionesNuevas += 1;
      else r.prospeccionesRepetidas += 1;
    }
  });

  return r;
}

/**
 * Guarda el contacto extraído y avanza el estado de la prospección (Fase 2).
 *
 * Dos reglas de diseño que se cumplen acá:
 *
 *  - **Priorizar, no descartar.** Sin email NO se borra nada: la prospección
 *    pasa a `sin_contacto` y queda para revisar. El negocio sigue en la base.
 *  - **No retroceder.** Solo se avanza desde `negocio_encontrado`. Si la
 *    prospección ya iba en `aprobado` o `enviado`, una re-corrida de la Fase 2
 *    no la devuelve a `contacto_encontrado`.
 *
 * ===========================================================================
 * Redes/teléfono se guardan AUNQUE no haya email (arreglado 2026-08-04)
 * ===========================================================================
 *
 * `extraerContacto()` busca redes sociales en CUALQUIER página que responda,
 * sin importar si después encuentra un email ahí (ver contactoService.ts:
 * "las redes se acumulan de cualquier página que responda"). Antes, esta
 * función solo insertaba en `contactos` dentro del `if (email !== null)` — así
 * que un negocio con Instagram linkeado pero sin email visible (el caso típico
 * de "solo formulario de contacto") encontraba su Instagram y un instante
 * después lo perdía, porque no había ningún INSERT que lo guardara.
 *
 * Esto NO cambia qué cuenta como "tiene contacto" para el pipeline ni para el
 * score: `estadoNuevo` sigue dependiendo solo del email, exactamente igual que
 * antes. Es exclusivamente para que el empleado pueda ver, en la ficha del
 * lead, un canal por el que sí puede escribirle a mano — el sistema no lo usa
 * para nada automático.
 */
export async function registrarContacto(
  negocioId: string,
  prospeccionId: string,
  contacto: {
    email: string | null;
    telefono?: string | null;
    redes?: Record<string, string> | null;
    origen: string | null;
    ofuscado?: boolean;
  },
): Promise<{ estadoNuevo: 'contacto_encontrado' | 'sin_contacto'; contactoId: string | null }> {
  return enTransaccion(async (c) => {
    let contactoId: string | null = null;
    const redesJSON =
      contacto.redes === undefined || contacto.redes === null ? null : JSON.stringify(contacto.redes);

    if (contacto.email !== null) {
      // `origen_del_correo` tiene CHECK; si el extractor devuelve algo que no
      // está en la lista, se guarda como null en vez de reventar la corrida.
      const { rows } = await c.query<{ id: string }>(
        `insert into contactos (negocio_id, email, telefono, redes, origen_del_correo, email_ofuscado)
         values ($1, $2, $3, $4,
           case when $5 in ('footer','contacto','about','mailto','facebook','instagram','places','manual','proveedor')
                then $5 else null end,
           $6)
         on conflict (negocio_id, email) do update set
           telefono          = coalesce(excluded.telefono, contactos.telefono),
           redes             = coalesce(excluded.redes, contactos.redes),
           origen_del_correo = coalesce(excluded.origen_del_correo, contactos.origen_del_correo),
           email_ofuscado    = excluded.email_ofuscado
         returning id`,
        [negocioId, contacto.email, contacto.telefono ?? null, redesJSON, contacto.origen, contacto.ofuscado ?? false],
      );
      contactoId = rows[0]!.id;
    } else if ((contacto.telefono ?? null) !== null || redesJSON !== null) {
      // Sin email, pero SÍ hay algo por donde escribirle a mano. `on conflict`
      // apunta al índice parcial de la migración 018 (a lo sumo una fila sin
      // email por negocio): si esta prospección se re-corre, actualiza en vez
      // de duplicar.
      const { rows } = await c.query<{ id: string }>(
        `insert into contactos (negocio_id, email, telefono, redes)
         values ($1, null, $2, $3)
         on conflict (negocio_id) where email is null do update set
           telefono = coalesce(excluded.telefono, contactos.telefono),
           redes    = coalesce(excluded.redes, contactos.redes)
         returning id`,
        [negocioId, contacto.telefono ?? null, redesJSON],
      );
      contactoId = rows[0]!.id;
    }

    const estadoNuevo = contacto.email !== null ? 'contacto_encontrado' : 'sin_contacto';

    await c.query(
      `update prospecciones set estado = $2
       where id = $1 and estado = 'negocio_encontrado'`,
      [prospeccionId, estadoNuevo],
    );

    return { estadoNuevo, contactoId };
  });
}

/**
 * Marca como `sin_contacto` las prospecciones cuyo negocio NO tiene sitio web.
 *
 * ¿Por qué hace falta una función aparte? Porque `pendientesDeContacto` filtra
 * por `sitio_web is not null`, así que un negocio sin web nunca entra a la
 * Fase 2 — y por lo tanto nada lo marcaba: se quedaba en `negocio_encontrado`
 * para siempre y el cron diario lo volvía a examinar todos los días sin que
 * nunca pudiera avanzar.
 *
 * Lo encontró `npm run probar:fase2`: un negocio del fixture quedó varado.
 *
 * Correr esto al CERRAR la Fase 2 de una búsqueda, no al abrirla.
 */
export async function marcarSinWeb(busquedaId: string): Promise<number> {
  const { rowCount } = await poolPostgres().query(
    `update prospecciones p set estado = 'sin_contacto'
     from negocios n
     where n.id = p.negocio_id
       and p.busqueda_id = $1
       and p.estado = 'negocio_encontrado'
       and n.sitio_web is null`,
    [busquedaId],
  );
  return rowCount ?? 0;
}

/**
 * Negocios de una búsqueda que tienen web y todavía no tienen contacto.
 * Es la entrada de la Fase 2.
 */
export async function pendientesDeContacto(
  busquedaId: string,
): Promise<Array<{ prospeccionId: string; negocioId: string; nombre: string; sitioWeb: string; dominio: string | null }>> {
  const { rows } = await poolPostgres().query<{
    prospeccion_id: string;
    negocio_id: string;
    nombre: string;
    sitio_web: string;
    dominio: string | null;
  }>(
    `select p.id as prospeccion_id, n.id as negocio_id, n.nombre, n.sitio_web, n.dominio
     from prospecciones p
     join negocios n on n.id = p.negocio_id
     where p.busqueda_id = $1
       and p.estado = 'negocio_encontrado'
       and n.sitio_web is not null
       and not exists (select 1 from contactos c where c.negocio_id = n.id and c.email is not null)
     order by n.num_resenas desc nulls last`,
    [busquedaId],
  );
  return rows.map((x) => ({
    prospeccionId: x.prospeccion_id,
    negocioId: x.negocio_id,
    nombre: x.nombre,
    sitioWeb: x.sitio_web,
    dominio: x.dominio,
  }));
}
