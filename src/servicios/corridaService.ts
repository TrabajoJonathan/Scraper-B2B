/**
 * corridaService — encargar y seguir el trabajo (Fase 6).
 *
 * Capa: servicios. Lo llaman tanto las rutas de la app como el cron.
 *
 * ===========================================================================
 * Por qué existe: el pipeline NO cabe en una petición de Vercel
 * ===========================================================================
 *
 * Una corrida completa tarda minutos; una función serverless se corta en
 * decenas de segundos. Así que se parte en dos responsabilidades:
 *
 *   `crearCorrida()`   ← lo llama el botón "Buscar". Registra y responde YA.
 *   `avanzarCorrida()` ← lo llama el cron. Hace UN paso y devuelve el control.
 *
 * Cada paso tiene que caber solo en el límite de una función. Por eso el cron
 * avanza de a uno en vez de correr el pipeline entero.
 */

import { enTransaccion, poolPostgres } from '../core/postgres.ts';
import type { SearchSpec } from '../dominio/tipos.ts';

export const PASOS = ['descubrir', 'contacto', 'verificar', 'priorizar', 'redactar', 'listo'] as const;
export type Paso = (typeof PASOS)[number];

export const ESTADOS_CORRIDA = ['pendiente', 'corriendo', 'completada', 'fallida', 'cancelada'] as const;
export type EstadoCorrida = (typeof ESTADOS_CORRIDA)[number];

export type Corrida = {
  id: string;
  busqueda_id: string;
  estado: EstadoCorrida;
  paso: Paso;
  progreso_hecho: number;
  progreso_total: number | null;
  error: string | null;
  creada_por_email: string | null;
  creada_en: string;
  iniciada_en: string | null;
  terminada_en: string | null;
  /** Del join con `busquedas`, para mostrar sin otra consulta. */
  producto: string;
  categoria: string;
  ubicacion: string;
};

/**
 * Encarga una corrida. NO ejecuta nada.
 *
 * Crea la búsqueda (el "por qué") y la corrida (el trabajo) en una sola
 * transacción: si algo falla, no queda una búsqueda huérfana sin corrida ni una
 * corrida apuntando a nada.
 */
export async function crearCorrida(
  spec: SearchSpec,
  usuarioEmail: string,
  fuente: 'lista_jefe' | 'cerebro' = 'lista_jefe',
): Promise<{ corridaId: string; busquedaId: string }> {
  return enTransaccion(async (c) => {
    const { rows: b } = await c.query<{ id: string }>(
      `insert into busquedas (producto, categoria, ubicacion, canal, fuente)
       values ($1,$2,$3,$4,$5) returning id`,
      [spec.producto, spec.categoria, spec.ubicacion, spec.canal, fuente],
    );
    const busquedaId = b[0]!.id;

    const { rows: co } = await c.query<{ id: string }>(
      `insert into corridas (busqueda_id, creada_por_email) values ($1,$2) returning id`,
      [busquedaId, usuarioEmail],
    );
    return { corridaId: co[0]!.id, busquedaId };
  });
}

export async function obtenerCorrida(id: string): Promise<Corrida | null> {
  const { rows } = await poolPostgres().query<Corrida>(
    `select co.*, b.producto, b.categoria, b.ubicacion
     from corridas co join busquedas b on b.id = co.busqueda_id
     where co.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listarCorridas(limite = 20): Promise<Corrida[]> {
  const { rows } = await poolPostgres().query<Corrida>(
    `select co.*, b.producto, b.categoria, b.ubicacion
     from corridas co join busquedas b on b.id = co.busqueda_id
     order by co.creada_en desc limit $1`,
    [limite],
  );
  return rows;
}

/** Actualiza el progreso. Lo llama el cron entre pasos. */
export async function actualizarProgreso(
  corridaId: string,
  cambios: { paso?: Paso; hecho?: number; total?: number | null },
): Promise<void> {
  await poolPostgres().query(
    `update corridas set
       paso = coalesce($2, paso),
       progreso_hecho = coalesce($3, progreso_hecho),
       progreso_total = case when $4::boolean then $5 else progreso_total end,
       estado = case when estado = 'pendiente' then 'corriendo' else estado end,
       iniciada_en = coalesce(iniciada_en, now())
     where id = $1`,
    [
      corridaId,
      cambios.paso ?? null,
      cambios.hecho ?? null,
      cambios.total !== undefined,
      cambios.total ?? null,
    ],
  );
}

export async function terminarCorrida(
  corridaId: string,
  resultado: { ok: true } | { ok: false; error: string },
): Promise<void> {
  await poolPostgres().query(
    `update corridas set
       estado = $2,
       paso = case when $2 = 'completada' then 'listo' else paso end,
       -- Al completar, el progreso se iguala al total: si no, una corrida
       -- terminada muestra la barra a medias y parece que quedó colgada.
       -- (Se vio en la primera prueba del panel: 71% en una corrida lista.)
       progreso_hecho = case
         when $2 = 'completada' and progreso_total is not null then progreso_total
         else progreso_hecho end,
       error = $3,
       terminada_en = now()
     where id = $1`,
    [corridaId, resultado.ok ? 'completada' : 'fallida', resultado.ok ? null : resultado.error],
  );
}

/**
 * Toma la corrida pendiente más vieja y la marca como corriendo.
 *
 * `for update skip locked` es lo que hace esto seguro con varios workers: si dos
 * invocaciones del cron se solapan, la segunda SALTA la fila que la primera ya
 * tomó en vez de esperarla. Sin `skip locked`, dos crons harían el mismo trabajo
 * dos veces o se bloquearían mutuamente.
 */
export async function tomarSiguienteCorrida(): Promise<Corrida | null> {
  return enTransaccion(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `select id from corridas
       where estado in ('pendiente', 'corriendo')
       order by creada_en asc
       limit 1
       for update skip locked`,
    );
    if (rows.length === 0) return null;

    await c.query(
      `update corridas set estado = 'corriendo', iniciada_en = coalesce(iniciada_en, now())
       where id = $1`,
      [rows[0]!.id],
    );

    const { rows: full } = await c.query<Corrida>(
      `select co.*, b.producto, b.categoria, b.ubicacion
       from corridas co join busquedas b on b.id = co.busqueda_id
       where co.id = $1`,
      [rows[0]!.id],
    );
    return full[0] ?? null;
  });
}

/** Contadores para el tablero. Una consulta, no cinco. */
export async function resumen(): Promise<{
  negocios: number;
  conEmail: number;
  verificados: number;
  borradoresPendientes: number;
  aprobados: number;
  corridasActivas: number;
}> {
  const { rows } = await poolPostgres().query<{
    negocios: string; con_email: string; verificados: string;
    borradores: string; aprobados: string; activas: string;
  }>(
    `select
       (select count(*) from negocios)::text as negocios,
       (select count(distinct negocio_id) from contactos where email is not null)::text as con_email,
       (select count(*) from contactos where estado_verificacion = 'verificado')::text as verificados,
       (select count(*) from correos where estado in ('borrador','editado'))::text as borradores,
       (select count(*) from correos where estado = 'aprobado')::text as aprobados,
       (select count(*) from corridas where estado in ('pendiente','corriendo'))::text as activas`,
  );
  const r = rows[0]!;
  return {
    negocios: Number(r.negocios),
    conEmail: Number(r.con_email),
    verificados: Number(r.verificados),
    borradoresPendientes: Number(r.borradores),
    aprobados: Number(r.aprobados),
    corridasActivas: Number(r.activas),
  };
}
