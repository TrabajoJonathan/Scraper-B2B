/**
 * panelService — las consultas de LECTURA que necesita la app web (Fase 6).
 *
 * Capa: servicios. Va aparte de los servicios del pipeline a propósito: acá
 * viven consultas hechas para pantallas (filtros, paginación, joins para
 * mostrar), no lógica de negocio. Mezclarlas haría que un cambio de la interfaz
 * toque el pipeline.
 */

import { poolPostgres } from '../core/postgres.ts';

/**
 * Órdenes disponibles para /leads.
 *
 * `score` es el default y el único que importa para decidir a quién escribir
 * primero — por eso sigue siendo el que se aplica sin que el empleado toque
 * nada. Los otros cuatro no reemplazan esa prioridad: sirven para la pregunta
 * distinta de "¿cuáles son los negocios más establecidos de la lista?", que no
 * tiene por qué coincidir con el orden de score.
 */
export const ORDENES_LEADS = [
  'score',
  'resenas_desc',
  'resenas_asc',
  'rating_desc',
  'rating_asc',
] as const;
export type OrdenLeads = (typeof ORDENES_LEADS)[number];

export type FiltrosLeads = {
  busquedaId?: string;
  estado?: string;
  /** 'con' | 'sin' — filtra por si tiene email */
  email?: 'con' | 'sin';
  /** Busca en el nombre del negocio. */
  texto?: string;
  limite?: number;
  orden?: OrdenLeads;
};

/**
 * Mapa cerrado orden -> SQL. A propósito NO se interpola `orden` directo en el
 * ORDER BY: aunque hoy viene de un <select> con valores fijos, la regla es que
 * un valor que termina en una consulta SQL nunca se arma con texto del
 * usuario, ni siquiera cuando "hoy" no hay forma de mandar otra cosa.
 */
const ORDER_BY: Record<OrdenLeads, string> = {
  score: 'p.score desc nulls last, n.num_resenas desc nulls last',
  resenas_desc: 'n.num_resenas desc nulls last, p.score desc nulls last',
  resenas_asc: 'n.num_resenas asc nulls last, p.score desc nulls last',
  rating_desc: 'n.rating desc nulls last, n.num_resenas desc nulls last',
  rating_asc: 'n.rating asc nulls last, n.num_resenas desc nulls last',
};

export type LeadEnPanel = {
  prospeccionId: string;
  negocio: string;
  categoria: string | null;
  direccion: string | null;
  sitioWeb: string | null;
  rating: number | null;
  numResenas: number | null;
  email: string | null;
  estadoVerificacion: string | null;
  estado: string;
  score: number | null;
  razon: string | null;
  producto: string;
  /**
   * Aparte del email a propósito: el objetivo es conseguir clientes, no solo
   * mandar correos. Un negocio sin email pero con teléfono o Instagram sigue
   * siendo un lead al que se puede escribir — por eso viajan siempre, tenga o
   * no email, en vez de esconderse detrás de `email === null`.
   */
  telefono: string | null;
  redes: Record<string, string> | null;
};

/**
 * Lista leads con filtros. Por defecto, ordenados por score.
 *
 * `nulls last` importa en todos los órdenes, no solo en el de score: un
 * negocio sin reseñas o sin rating cargado no debe aparecer primero en un
 * orden descendente solo porque `null` se compara como si fuera el valor más
 * alto.
 */
export async function listarLeads(f: FiltrosLeads = {}): Promise<LeadEnPanel[]> {
  const { rows } = await poolPostgres().query<{
    prospeccion_id: string; negocio: string; categoria: string | null;
    direccion: string | null; sitio_web: string | null; rating: string | null;
    num_resenas: number | null; email: string | null;
    estado_verificacion: string | null; estado: string;
    score: number | null; razon: string | null; producto: string;
    telefono: string | null; redes: Record<string, string> | null;
  }>(
    `select
       p.id as prospeccion_id, n.nombre as negocio, n.categoria_google as categoria,
       n.direccion, n.sitio_web, n.rating, n.num_resenas,
       ct.email, ct.estado_verificacion, n.telefono, ct.redes,
       p.estado, p.score, p.razon, b.producto
     from prospecciones p
       join negocios  n on n.id = p.negocio_id
       join busquedas b on b.id = p.busqueda_id
       -- Prefiere la fila CON email si existe; si no, la única que puede
       -- haber (a lo sumo una, migración 018) es la de "sin email pero con
       -- redes" -- por eso sigue trayendo algo útil igual.
       --
       -- El teléfono NO sale de acá: contactos.telefono es una columna que
       -- nada llena en la práctica (el extractor del sitio ni siquiera busca
       -- teléfono, solo email y redes). El teléfono real es el de Google
       -- Places, que vive en negocios.telefono -- por eso el SELECT de
       -- arriba lee n.telefono, no ct.telefono.
       left join lateral (
         select email, estado_verificacion, redes from contactos
         where negocio_id = n.id
         order by (email is not null) desc, creado_en asc limit 1
       ) ct on true
     where ($1::uuid is null or p.busqueda_id = $1::uuid)
       and ($2::text is null or p.estado = $2::text)
       and ($3::text is null
            or ($3 = 'con' and ct.email is not null)
            or ($3 = 'sin' and ct.email is null))
       and ($4::text is null or n.nombre ilike '%' || $4 || '%')
     order by ${ORDER_BY[f.orden ?? 'score']}
     limit $5`,
    [f.busquedaId ?? null, f.estado ?? null, f.email ?? null, f.texto ?? null, f.limite ?? 100],
  );

  return rows.map((r) => ({
    prospeccionId: r.prospeccion_id,
    negocio: r.negocio,
    categoria: r.categoria,
    direccion: r.direccion,
    sitioWeb: r.sitio_web,
    rating: r.rating === null ? null : Number(r.rating),
    numResenas: r.num_resenas,
    email: r.email,
    estadoVerificacion: r.estado_verificacion,
    estado: r.estado,
    score: r.score,
    razon: r.razon,
    producto: r.producto,
    telefono: r.telefono,
    redes: r.redes,
  }));
}

/** Cuántos leads hay en cada estado — para los filtros y los contadores. */
export async function conteoPorEstado(busquedaId?: string): Promise<Record<string, number>> {
  const { rows } = await poolPostgres().query<{ estado: string; n: string }>(
    `select estado, count(*)::text as n from prospecciones
     where ($1::uuid is null or busqueda_id = $1::uuid)
     group by estado order by estado`,
    [busquedaId ?? null],
  );
  return Object.fromEntries(rows.map((r) => [r.estado, Number(r.n)]));
}

/** El desglose del score de un lead, para la vista "¿por qué este puntaje?". */
export async function detalleDeScore(prospeccionId: string): Promise<unknown | null> {
  const { rows } = await poolPostgres().query<{ score_detalle: unknown }>(
    `select score_detalle from prospecciones where id = $1`,
    [prospeccionId],
  );
  return rows[0]?.score_detalle ?? null;
}
