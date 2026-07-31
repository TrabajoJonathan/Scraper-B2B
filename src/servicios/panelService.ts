/**
 * panelService — las consultas de LECTURA que necesita la app web (Fase 6).
 *
 * Capa: servicios. Va aparte de los servicios del pipeline a propósito: acá
 * viven consultas hechas para pantallas (filtros, paginación, joins para
 * mostrar), no lógica de negocio. Mezclarlas haría que un cambio de la interfaz
 * toque el pipeline.
 */

import { poolPostgres } from '../core/postgres.ts';

export type FiltrosLeads = {
  busquedaId?: string;
  estado?: string;
  /** 'con' | 'sin' — filtra por si tiene email */
  email?: 'con' | 'sin';
  /** Busca en el nombre del negocio. */
  texto?: string;
  limite?: number;
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
};

/**
 * Lista leads con filtros, ordenados por score.
 *
 * `nulls last` importa: un lead sin puntuar todavía no debe aparecer arriba de
 * uno con score 90 solo porque su score es null.
 */
export async function listarLeads(f: FiltrosLeads = {}): Promise<LeadEnPanel[]> {
  const { rows } = await poolPostgres().query<{
    prospeccion_id: string; negocio: string; categoria: string | null;
    direccion: string | null; sitio_web: string | null; rating: string | null;
    num_resenas: number | null; email: string | null;
    estado_verificacion: string | null; estado: string;
    score: number | null; razon: string | null; producto: string;
  }>(
    `select
       p.id as prospeccion_id, n.nombre as negocio, n.categoria_google as categoria,
       n.direccion, n.sitio_web, n.rating, n.num_resenas,
       ct.email, ct.estado_verificacion,
       p.estado, p.score, p.razon, b.producto
     from prospecciones p
       join negocios  n on n.id = p.negocio_id
       join busquedas b on b.id = p.busqueda_id
       left join lateral (
         select email, estado_verificacion from contactos
         where negocio_id = n.id
         order by (email is not null) desc, creado_en asc limit 1
       ) ct on true
     where ($1::uuid is null or p.busqueda_id = $1::uuid)
       and ($2::text is null or p.estado = $2::text)
       and ($3::text is null
            or ($3 = 'con' and ct.email is not null)
            or ($3 = 'sin' and ct.email is null))
       and ($4::text is null or n.nombre ilike '%' || $4 || '%')
     order by p.score desc nulls last, n.num_resenas desc nulls last
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
