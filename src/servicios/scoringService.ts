/**
 * scoringService — priorizar leads (Fase 4).
 *
 * Capa: servicios. Junta los datos de las fases 1-3, se los pasa al motor y
 * guarda el resultado.
 *
 * El motor (`scoring/motor.ts`) es puro y no sabe de base de datos. Este archivo
 * es el único que la toca. Consecuencia práctica: se puede recalcular el score
 * de toda la base sin gastar una sola llamada a ninguna API — el score sale de
 * datos que ya tenemos guardados.
 *
 * REGLA DEL PROYECTO: priorizar, no descartar. Este servicio ORDENA. No borra
 * nada y no cambia el estado de la prospección más allá de marcarla
 * `priorizado`.
 */

import { poolPostgres, enTransaccion } from '../core/postgres.ts';
import { calcularScore } from './scoring/motor.ts';
import { REGLAS } from './scoring/reglas.ts';
import { pesosActuales, type EstrategiaCombinacion } from './scoring/configuracion.ts';
import { esSoloRedes, type SenalesWeb } from './contactoService.ts';
import type { LeadParaScoring, Pesos } from '../dominio/scoring.ts';

/** Guarda las señales del sitio (las extrae la Fase 2 del HTML que ya baja). */
export async function guardarSenalesWeb(
  negocioId: string,
  respondio: boolean,
  senales: SenalesWeb | null,
  soloRedes: boolean,
): Promise<void> {
  await enTransaccion(async (c) => {
    await c.query(
      `insert into senales_web
         (negocio_id, respondio, tiene_pixel_meta, tiene_tag_google,
          anio_copyright, es_responsive, solo_redes, plataforma, capturado_en)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now())
       on conflict (negocio_id) do update set
         respondio        = excluded.respondio,
         tiene_pixel_meta = excluded.tiene_pixel_meta,
         tiene_tag_google = excluded.tiene_tag_google,
         anio_copyright   = excluded.anio_copyright,
         es_responsive    = excluded.es_responsive,
         solo_redes       = excluded.solo_redes,
         plataforma       = excluded.plataforma,
         capturado_en     = now()`,
      [
        negocioId,
        respondio,
        senales?.tiene_pixel_meta ?? null,
        senales?.tiene_tag_google ?? null,
        senales?.anio_copyright ?? null,
        senales?.es_responsive ?? null,
        soloRedes,
        senales?.plataforma ?? null,
      ],
    );
  });
}

/**
 * Trae todo lo necesario para puntuar los leads de una búsqueda.
 *
 * El `count` de sucursales se calcula acá y no se guarda en ninguna tabla: es
 * derivado (negocios que comparten dominio o nombre normalizado) y guardarlo
 * significaría mantenerlo sincronizado cada vez que entra un negocio nuevo.
 * Calcularlo al puntuar es más barato que arriesgarse a que quede viejo.
 */
async function cargarLeads(
  busquedaId: string,
  anioActual: number,
): Promise<Array<{ prospeccionId: string; nombre: string; lead: LeadParaScoring }>> {
  const { rows } = await poolPostgres().query<{
    prospeccion_id: string;
    nombre: string;
    rating: string | null;
    num_resenas: number | null;
    sitio_web: string | null;
    dominio: string | null;
    categoria_google: string | null;
    sucursales: string;
    web_respondio: boolean | null;
    tiene_pixel_meta: boolean | null;
    tiene_tag_google: boolean | null;
    anio_copyright: number | null;
    es_responsive: boolean | null;
    solo_redes: boolean | null;
    tiene_email: boolean;
    tiene_redes: boolean | null;
    es_rol: boolean | null;
  }>(
    `select
       p.id as prospeccion_id,
       n.nombre, n.rating, n.num_resenas, n.sitio_web, n.dominio, n.categoria_google,
       -- sucursales: locales que comparten dominio (o nombre si no hay dominio)
       (select count(*) from negocios o
         where (n.dominio is not null and o.dominio = n.dominio)
            or (n.dominio is null and o.nombre_normalizado = n.nombre_normalizado)
       )::text as sucursales,
       s.respondio        as web_respondio,
       s.tiene_pixel_meta, s.tiene_tag_google, s.anio_copyright,
       s.es_responsive, s.solo_redes,
       (c.email is not null)      as tiene_email,
       (c.redes is not null)      as tiene_redes,
       c.es_rol
     from prospecciones p
       join negocios n on n.id = p.negocio_id
       left join senales_web s on s.negocio_id = n.id
       -- un negocio puede tener varios contactos: tomamos uno cualquiera con
       -- email, que es lo que el filtro necesita saber
       left join lateral (
         select email, redes, es_rol from contactos
         where negocio_id = n.id
         order by (email is not null) desc, creado_en asc
         limit 1
       ) c on true
     where p.busqueda_id = $1
       and p.estado not in ('descartado_por_humano')`,
    [busquedaId],
  );

  return rows.map((r) => ({
    prospeccionId: r.prospeccion_id,
    nombre: r.nombre,
    lead: {
      // Postgres devuelve numeric como string para no perder precisión.
      rating: r.rating === null ? null : Number(r.rating),
      num_resenas: r.num_resenas,
      sitio_web: r.sitio_web,
      dominio: r.dominio,
      categoria_google: r.categoria_google,
      sucursales: Number(r.sucursales),
      web_respondio: r.web_respondio,
      tiene_pixel_meta: r.tiene_pixel_meta,
      tiene_tag_google: r.tiene_tag_google,
      anio_copyright: r.anio_copyright,
      es_responsive: r.es_responsive,
      solo_redes: r.solo_redes ?? esSoloRedes(r.dominio),
      tiene_redes: r.tiene_redes,
      tiene_email: r.tiene_email,
      es_rol: r.es_rol,
      // Pendiente de integrar RDAP. null = "no se sabe", NO "es nuevo".
      antiguedad_dominio_anios: null,
      anio_actual: anioActual,
    },
  }));
}

export type ResultadoPriorizacion = {
  evaluados: number;
  conScore: number;
  filtrados: number;
  scorePromedio: number | null;
  /** Los mejores, para poder mirar el top a ojo. */
  top: Array<{ nombre: string; score: number | null; razon: string }>;
};

/**
 * Puntúa y ordena los leads de una búsqueda.
 *
 * Se puede volver a correr cuantas veces se quiera: no gasta APIs y siempre da
 * el mismo resultado con los mismos datos. Eso permite recalibrar pesos y ver el
 * efecto inmediato sobre la lista real.
 */
export async function priorizar(
  busquedaId: string,
  opciones: {
    pesos?: Partial<Pesos>;
    estrategia?: EstrategiaCombinacion;
    /** Inyectado para que el resultado sea determinista y probable. */
    anioActual?: number;
  } = {},
): Promise<ResultadoPriorizacion> {
  const anioActual = opciones.anioActual ?? new Date().getFullYear();
  const pesos = pesosActuales(opciones.pesos);
  const leads = await cargarLeads(busquedaId, anioActual);

  const calculados = leads.map((l) => ({
    ...l,
    resultado: calcularScore(l.lead, {
      reglas: REGLAS,
      pesos,
      estrategia: opciones.estrategia,
    }),
  }));

  await enTransaccion(async (c) => {
    for (const { prospeccionId, resultado } of calculados) {
      await c.query(
        `update prospecciones
         set score = $2, razon = $3, score_detalle = $4,
             -- solo avanza a 'priorizado' desde estados anteriores: no
             -- retrocede un lead ya aprobado o enviado
             estado = case when estado in ('negocio_encontrado','contacto_encontrado')
                           then 'priorizado' else estado end
         where id = $1`,
        [
          prospeccionId,
          resultado.score,
          resultado.razon,
          JSON.stringify({
            porEje: resultado.porEje,
            filtradoPor: resultado.filtradoPor,
            reglas: resultado.detalle,
          }),
        ],
      );
    }
  });

  const conScore = calculados.filter((c) => c.resultado.score !== null);
  const suma = conScore.reduce((s, c) => s + (c.resultado.score ?? 0), 0);

  return {
    evaluados: calculados.length,
    conScore: conScore.length,
    filtrados: calculados.length - conScore.length,
    scorePromedio: conScore.length === 0 ? null : Math.round(suma / conScore.length),
    top: [...conScore]
      .sort((a, b) => (b.resultado.score ?? 0) - (a.resultado.score ?? 0))
      .slice(0, 10)
      .map((c) => ({
        nombre: c.nombre,
        score: c.resultado.score,
        razon: c.resultado.razon,
      })),
  };
}
