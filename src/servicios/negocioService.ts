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
