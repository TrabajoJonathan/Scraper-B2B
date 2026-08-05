/**
 * revisionService — el control humano (Fases 5 y 6).
 *
 * Capa: servicios. Es lo que van a llamar las rutas de la app interna.
 *
 * Va separado de `redaccionService` a propósito: generar un borrador y decidir si
 * sale son responsabilidades distintas. La generación es automática; la
 * aprobación es la única parte del sistema que un humano NO puede delegar.
 *
 * ===========================================================================
 * LA DECISIÓN IMPORTANTE: las puertas se exigen al ESCRIBIR, no solo al leer.
 * ===========================================================================
 *
 * `v_correos_enviables` ya filtra al leer, así que el panel nunca *muestra* un
 * correo que no debería enviarse. Pero eso protege contra un panel bien hecho,
 * no contra un script apurado, un `curl` a mano o una ruta nueva que se olvide
 * de usar la vista.
 *
 * `aprobar()` vuelve a comprobar las tres puertas antes de escribir. Es
 * redundante y tiene que serlo: la puerta que importa es la que está en el
 * camino de la escritura.
 */

import { enTransaccion, poolPostgres } from '../core/postgres.ts';

/** Quién está haciendo la acción. El email se guarda como copia de auditoría. */
export type Usuario = {
  /** uuid de auth.users. Opcional mientras no exista Supabase Auth (Fase 6). */
  id?: string | null;
  email: string;
};

export type ResultadoAprobacion =
  | { ok: true; correoId: string }
  | { ok: false; motivo: string; detalle?: string };

/**
 * Aprueba un borrador para envío.
 *
 * Falla —y no escribe nada— si el correo no pasa las tres puertas:
 *   1. está pendiente de revisión (`borrador` o `editado`)
 *   2. el email está `verificado` (decisión del jefe: los `catch_all` se saltan)
 *   3. el email no está en `supresiones` (opt-out)
 *
 * Devuelve un resultado en vez de lanzar: que un correo no sea aprobable es un
 * caso normal del flujo, no un error del programa. La UI necesita mostrar el
 * motivo, no una traza.
 */
export async function aprobar(
  correoId: string,
  usuario: Usuario,
): Promise<ResultadoAprobacion> {
  return enTransaccion(async (c) => {
    // `for update` bloquea la fila: si dos empleados aprietan aprobar al mismo
    // tiempo, el segundo espera y luego ve que ya está aprobado, en vez de
    // sobrescribir la auditoría del primero.
    const { rows: actual } = await c.query<{ estado: string; aprobado_por_email: string | null }>(
      `select estado, aprobado_por_email from correos where id = $1 for update`,
      [correoId],
    );
    if (actual.length === 0) {
      return { ok: false, motivo: 'no_existe' };
    }
    if (actual[0]!.estado === 'aprobado') {
      return {
        ok: false,
        motivo: 'ya_aprobado',
        detalle: `lo aprobó ${actual[0]!.aprobado_por_email ?? 'alguien'}`,
      };
    }
    if (actual[0]!.estado === 'enviado') {
      return { ok: false, motivo: 'ya_enviado' };
    }
    if (actual[0]!.estado === 'descartado') {
      return { ok: false, motivo: 'descartado' };
    }

    // Las tres puertas, otra vez, en el camino de la escritura.
    const { rows: enviable } = await c.query<{ id: string }>(
      `select correo_id as id from v_correos_enviables where correo_id = $1`,
      [correoId],
    );
    if (enviable.length === 0) {
      // Averiguar POR QUÉ, para poder decírselo al operador.
      const { rows: diag } = await c.query<{ estado_verificacion: string; suprimido: boolean }>(
        `select ct.estado_verificacion,
                exists (
                  select 1 from supresiones s
                  where (s.email is not null and lower(s.email) = lower(ct.email))
                     or (s.dominio is not null and lower(ct.email) like '%@' || lower(s.dominio))
                ) as suprimido
         from correos co join contactos ct on ct.id = co.contacto_id
         where co.id = $1`,
        [correoId],
      );
      const d = diag[0];
      if (d?.suprimido === true) {
        return { ok: false, motivo: 'opt_out', detalle: 'el contacto pidió no ser contactado' };
      }
      return {
        ok: false,
        motivo: 'email_no_verificado',
        detalle: `estado del email: ${d?.estado_verificacion ?? 'desconocido'}`,
      };
    }

    await c.query(
      `update correos
       set estado = 'aprobado',
           aprobado_por = $2, aprobado_por_email = $3, aprobado_en = now()
       where id = $1`,
      [correoId, usuario.id ?? null, usuario.email],
    );

    // El estado de la prospección refleja la posición en la tubería.
    await c.query(
      `update prospecciones set estado = 'aprobado'
       where id = (select prospeccion_id from correos where id = $1)
         and estado in ('correo_generado', 'priorizado')`,
      [correoId],
    );

    return { ok: true, correoId };
  });
}

/** Guarda una edición del borrador. No aprueba: sigue haciendo falta revisar. */
export async function editar(
  correoId: string,
  cambios: { asunto?: string; cuerpo?: string; cta?: string },
  usuario: Usuario,
): Promise<{ ok: boolean; motivo?: string }> {
  return enTransaccion(async (c) => {
    const { rows } = await c.query<{ estado: string }>(
      `select estado from correos where id = $1 for update`,
      [correoId],
    );
    if (rows.length === 0) return { ok: false, motivo: 'no_existe' };
    // Editar algo ya enviado no tiene sentido; editar algo aprobado tendría que
    // volver a pasar por revisión, así que se bloquea y se pide descartar primero.
    if (rows[0]!.estado === 'enviado' || rows[0]!.estado === 'aprobado') {
      return { ok: false, motivo: `no_editable_en_estado_${rows[0]!.estado}` };
    }

    await c.query(
      `update correos
       set asunto = coalesce($2, asunto),
           cuerpo = coalesce($3, cuerpo),
           cta    = coalesce($4, cta),
           estado = 'editado',
           editado_por = $5, editado_en = now()
       where id = $1`,
      [correoId, cambios.asunto ?? null, cambios.cuerpo ?? null, cambios.cta ?? null, usuario.id ?? null],
    );
    return { ok: true };
  });
}

/**
 * Descarta un borrador.
 *
 * `descartado_por_humano` es terminal para la prospección: el operador miró este
 * lead y decidió que no. No se borra nada — sigue valiendo "priorizar, no
 * descartar", y la decisión queda registrada para no volver a proponerlo.
 */
export async function descartar(
  correoId: string,
  usuario: Usuario,
  motivo?: string,
): Promise<{ ok: boolean }> {
  await enTransaccion(async (c) => {
    await c.query(
      `update correos set estado = 'descartado', editado_por = $2, editado_en = now()
       where id = $1 and estado in ('borrador','editado')`,
      [correoId, usuario.id ?? null],
    );
    await c.query(
      `update prospecciones set estado = 'descartado_por_humano',
         razon = coalesce($2, razon)
       where id = (select prospeccion_id from correos where id = $1)`,
      [correoId, motivo ?? null],
    );
  });
  return { ok: true };
}

/**
 * La cola de revisión: lo que un empleado tiene que mirar, en orden de score.
 *
 * Lee de `v_correos_enviables`, o sea que ya viene con las tres puertas
 * aplicadas. Es lo que la app interna va a mostrar.
 *
 * ===========================================================================
 * `busquedaId` es OPCIONAL desde el 2026-08-04 — antes era obligatorio
 * ===========================================================================
 *
 * Ahora "Generar borradores" (desde /leads) puede crear borradores de VARIAS
 * búsquedas en un solo click, porque la selección ya no está atada a una sola
 * búsqueda. Con `busquedaId` obligatorio, la pantalla de revisión solo podía
 * mostrar una a la vez — los borradores de la otra búsqueda quedaban
 * generados, aprobables, pero invisibles, sin ninguna pista de que existían.
 *
 * Ahora sin argumento trae TODO lo pendiente, cruzando búsquedas — el mismo
 * criterio que ya usa `/leads`. Pasar un id sigue funcionando, como filtro
 * opcional para acotar a una sola.
 */
export async function colaDeRevision(
  busquedaId?: string,
  limite = 50,
): Promise<Array<{
  correoId: string;
  negocio: string;
  email: string;
  asunto: string;
  cuerpo: string;
  cta: string;
  score: number | null;
  razon: string | null;
  /** Otros negocios que comparten este buzón. >0 = aprobar solo uno. */
  comparteBuzonCon: number;
  estadoVerificacion: string;
  /** De qué búsqueda vino — hace falta mostrarlo ahora que la cola las mezcla. */
  producto: string;
  telefono: string | null;
  redes: Record<string, string> | null;
  sitioWeb: string | null;
}>> {
  const { rows } = await poolPostgres().query<{
    correo_id: string; negocio: string; email: string; asunto: string;
    cuerpo: string; cta: string; score: number | null; razon: string | null;
    comparte: string; estado_verificacion: string; producto: string;
    telefono: string | null; redes: Record<string, string> | null;
    sitio_web: string | null;
  }>(
    `select e.correo_id, e.negocio, e.email, e.asunto, e.cuerpo, e.cta, e.score, e.razon,
            e.estado_verificacion, e.producto, n.telefono, n.sitio_web, ct.redes,
            (select count(*) - 1 from contactos c2
              where lower(c2.email) = lower(e.email))::text as comparte
     from v_correos_enviables e
       join prospecciones p on p.id = e.prospeccion_id
       join negocios n on n.id = e.negocio_id
       join contactos ct on ct.id = e.contacto_id
     where ($1::uuid is null or p.busqueda_id = $1::uuid)
     order by e.score desc nulls last
     limit $2`,
    [busquedaId ?? null, limite],
  );
  return rows.map((r) => ({
    correoId: r.correo_id,
    negocio: r.negocio,
    email: r.email,
    asunto: r.asunto,
    cuerpo: r.cuerpo,
    cta: r.cta,
    score: r.score,
    razon: r.razon,
    comparteBuzonCon: Number(r.comparte),
    estadoVerificacion: r.estado_verificacion,
    producto: r.producto,
    telefono: r.telefono,
    redes: r.redes,
    sitioWeb: r.sitio_web,
  }));
}
