/**
 * redaccionService — el primer correo por lead (Fase 5).
 *
 * Capa: servicios. Aqui vive el PROMPT; el core solo sabe hablarle a la API.
 */

import { generarEstructurado, costoUSD, MODELO_BARATO } from '../core/claude.ts';
import { enTransaccion, poolPostgres } from '../core/postgres.ts';
import type { NegocioDescubierto } from '../dominio/tipos.ts';

/**
 * System prompt. Estable a proposito (si algun dia pasa de 4096 tokens, se
 * vuelve cacheable en Haiku 4.5 y conviene activar prompt caching).
 *
 * Las reglas de tono salen del diseno original; el detalle vive ahora en
 * PROPUESTA-TECNICA.md §6 (el .md de investigacion se elimino: lo reemplazo
 * este codigo).
 */
const SYSTEM = `Eres el redactor de correos de prospeccion en frio de Codeflow, una empresa de IA y automatizacion para LATAM con foco en Panama.

TONO
- Espanol de LatAm, neutro. Directo y humano.
- Cero jerga corporativa. Cero relleno.
- Escribes como una persona que hizo la tarea, no como un formulario.

REGLAS DURAS
- Maximo 150 palabras en el cuerpo.
- UNA sola llamada a la accion. Nunca dos.
- Mencionas UN dato concreto y verificable del negocio (el que te den). Sin ese dato el correo no sirve.
- No inventas nada: ni clientes, ni cifras, ni "vi su sitio y me encanto el rediseno". Si no te dieron el dato, no existe.
- Prohibido abrir con formulas vacias tipo "espero que este correo le encuentre bien" o "paso por aqui para".
- No prometes resultados numericos ("triplicamos tus ventas").
- Tratamiento de usted.
- El asunto es de 4 a 8 palabras, sin signos de admiracion y sin MAYUSCULAS.

ESTRUCTURA DEL CUERPO
1. Una linea que demuestra que sabes a quien le escribes (usa el dato personalizador).
2. Una o dos lineas de que hace Codeflow, atadas a lo que ESE negocio podria necesitar.
3. La CTA: pedir algo minimo y facil de contestar (15 minutos, una respuesta de una linea).

La CTA va tambien en su propio campo, repetida tal como aparece en el cuerpo.`;

/** Fuerza la forma de la salida. La API garantiza que el JSON cumpla esto. */
const SCHEMA = {
  type: 'object',
  properties: {
    asunto: { type: 'string' },
    cuerpo: { type: 'string' },
    cta: { type: 'string' },
    dato_personalizador_usado: {
      type: 'string',
      description: 'El dato concreto del negocio que se menciono en el cuerpo.',
    },
  },
  required: ['asunto', 'cuerpo', 'cta', 'dato_personalizador_usado'],
  additionalProperties: false,
} as const;

export type Borrador = {
  asunto: string;
  cuerpo: string;
  cta: string;
  dato_personalizador_usado: string;
};

/**
 * Generador inyectable. En producción es Claude; en pruebas, un fixture.
 * Mismo patrón que el lector de Places y el de sitios web: permite probar la
 * persistencia y el flujo de revisión sin gastar créditos ni esperar la llave.
 */
export type Generador = (opciones: {
  system: string;
  usuario: string;
  modelo: string;
}) => Promise<{ borrador: Borrador; modelo: string; costoUSD: number }>;

/**
 * Elige el dato personalizador a partir de lo que Places nos dio gratis.
 * Devuelve null si el negocio no trae ningun dato utilizable: en ese caso NO
 * se redacta, porque un correo sin dato concreto es spam.
 */
export function elegirPersonalizador(n: NegocioDescubierto): string | null {
  if (n.num_resenas !== null && n.rating !== null && n.num_resenas >= 20) {
    return `tiene ${n.rating} estrellas con ${n.num_resenas} resenas en Google Maps`;
  }
  if (n.sitio_web === null) {
    return 'no aparece con sitio web propio en su ficha de Google Maps';
  }
  if (n.rating !== null) {
    return `tiene ${n.rating} estrellas en Google Maps`;
  }
  if (n.direccion !== null) {
    return `esta ubicado en ${n.direccion}`;
  }
  return null;
}

/** El generador real: Claude con salida estructurada. */
const generadorClaude: Generador = async ({ system, usuario, modelo }) => {
  const { resultado, uso, modelo: usado } = await generarEstructurado<Borrador>({
    modelo,
    system,
    usuario,
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1500,
  });
  return { borrador: resultado, modelo: usado, costoUSD: costoUSD(uso, usado) };
};

export async function redactar(opciones: {
  negocio: NegocioDescubierto;
  /** El producto que se quiere vender (viene del searchSpec). */
  producto: string;
  modelo?: string;
  generador?: Generador;
}): Promise<{ borrador: Borrador; modelo: string; costoUSD: number }> {
  const { negocio, producto } = opciones;
  const generador = opciones.generador ?? generadorClaude;

  const personalizador = elegirPersonalizador(negocio);
  if (personalizador === null) {
    throw new Error(
      `El negocio "${negocio.nombre}" no tiene ningun dato personalizador. ` +
        'No se redacta: un correo en frio sin dato concreto es spam.',
    );
  }

  const usuario = [
    `Producto a vender: ${producto}`,
    `Negocio: ${negocio.nombre}`,
    `Categoria (Google): ${negocio.categoria_google ?? 'no reportada'}`,
    `Ubicacion: ${negocio.direccion ?? 'no reportada'}`,
    `Sitio web: ${negocio.sitio_web ?? 'no tiene'}`,
    `Dato personalizador que DEBES usar: ${personalizador}`,
  ].join('\n');

  return generador({ system: SYSTEM, usuario, modelo: opciones.modelo ?? MODELO_BARATO });
}

// ---------------------------------------------------------------------------
// Persistencia y generación en lote
// ---------------------------------------------------------------------------

/** Guarda un borrador y avanza la prospección a `correo_generado`. */
export async function guardarBorrador(
  prospeccionId: string,
  contactoId: string,
  borrador: Borrador,
  modelo: string,
): Promise<string> {
  return enTransaccion(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into correos (prospeccion_id, contacto_id, asunto, cuerpo, cta, modelo)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (prospeccion_id, contacto_id) do update set
         asunto = excluded.asunto,
         cuerpo = excluded.cuerpo,
         cta    = excluded.cta,
         modelo = excluded.modelo
       returning id`,
      [prospeccionId, contactoId, borrador.asunto, borrador.cuerpo, borrador.cta, modelo],
    );
    await c.query(
      `update prospecciones set estado = 'correo_generado'
       where id = $1 and estado in ('priorizado', 'contacto_encontrado')`,
      [prospeccionId],
    );
    return rows[0]!.id;
  });
}

export type ResultadoGeneracion = {
  candidatos: number;
  generados: number;
  /** Se saltaron por compartir buzón con uno ya generado. Ver abajo. */
  omitidosPorBuzonCompartido: number;
  sinPersonalizador: number;
  costoUSD: number;
};

/**
 * Genera borradores para los leads priorizados de una búsqueda.
 *
 * ===========================================================================
 * UN BORRADOR POR BUZÓN, NO POR PROSPECCIÓN.
 * ===========================================================================
 *
 * Mismo criterio que en la Fase 3 con el verificador, y por las mismas razones.
 * Las 2 sucursales de una cadena comparten `reservas@laterraza.com.pa`. Generar
 * un borrador para cada una significa:
 *
 *  - **pagar dos llamadas a Claude** para un buzón que va a recibir UN correo
 *  - **obligar al operador a elegir** entre dos textos casi idénticos
 *
 * Así que se genera para la prospección de MAYOR score de cada buzón, y las
 * demás se cuentan en `omitidosPorBuzonCompartido`. Quedan en `priorizado` con
 * una nota en su razón: no se pierden, simplemente ya están cubiertas por el
 * correo que sí se va a enviar.
 *
 * En una cadena de 15 locales eso son 14 llamadas ahorradas.
 */
export async function generarBorradores(
  busquedaId: string,
  opciones: { generador?: Generador; maximo?: number; modelo?: string } = {},
): Promise<ResultadoGeneracion> {
  const maximo = opciones.maximo ?? 100;

  // Un candidato por buzón: el de mejor score. `distinct on` de Postgres es
  // exactamente esto — la primera fila de cada grupo según el `order by`.
  const { rows: candidatos } = await poolPostgres().query<{
    prospeccion_id: string;
    contacto_id: string;
    email: string;
    producto: string;
    nombre: string;
    categoria_google: string | null;
    direccion: string | null;
    sitio_web: string | null;
    rating: string | null;
    num_resenas: number | null;
    hermanos: string;
  }>(
    `select distinct on (lower(ct.email))
       p.id as prospeccion_id, ct.id as contacto_id, ct.email,
       b.producto, n.nombre, n.categoria_google, n.direccion, n.sitio_web,
       n.rating, n.num_resenas,
       -- cuántas otras prospecciones de esta búsqueda comparten este buzón
       (select count(*) - 1 from contactos c2
          join prospecciones p2 on p2.negocio_id = c2.negocio_id
         where lower(c2.email) = lower(ct.email) and p2.busqueda_id = b.id
       )::text as hermanos
     from prospecciones p
       join busquedas b  on b.id = p.busqueda_id
       join negocios  n  on n.id = p.negocio_id
       join contactos ct on ct.negocio_id = n.id and ct.email is not null
     where p.busqueda_id = $1
       and p.estado in ('priorizado', 'contacto_encontrado')
       and ct.estado_verificacion = 'verificado'
     order by lower(ct.email), p.score desc nulls last
     limit $2`,
    [busquedaId, maximo],
  );

  const r: ResultadoGeneracion = {
    candidatos: candidatos.length,
    generados: 0,
    omitidosPorBuzonCompartido: 0,
    sinPersonalizador: 0,
    costoUSD: 0,
  };

  for (const cand of candidatos) {
    r.omitidosPorBuzonCompartido += Number(cand.hermanos);

    const negocio: NegocioDescubierto = {
      place_id: null,
      nombre: cand.nombre,
      nombre_normalizado: '',
      dominio: null,
      sitio_web: cand.sitio_web,
      telefono: null,
      direccion: cand.direccion,
      categoria_google: cand.categoria_google,
      rating: cand.rating === null ? null : Number(cand.rating),
      num_resenas: cand.num_resenas,
      estado_negocio: null,
      url_maps: null,
    };

    // Sin dato personalizador no se redacta: un correo en frío genérico es spam.
    if (elegirPersonalizador(negocio) === null) {
      r.sinPersonalizador += 1;
      continue;
    }

    const { borrador, modelo, costoUSD: costo } = await redactar({
      negocio,
      producto: cand.producto,
      modelo: opciones.modelo,
      generador: opciones.generador,
    });

    await guardarBorrador(cand.prospeccion_id, cand.contacto_id, borrador, modelo);
    r.generados += 1;
    r.costoUSD += costo;
  }

  // Las prospecciones cubiertas por el correo de un hermano: se anotan para que
  // el operador entienda por qué no tienen borrador propio.
  await poolPostgres().query(
    `update prospecciones p
     set razon = coalesce(p.razon, '') || ' · cubierta por el correo a un buzón compartido'
     from contactos ct
     where ct.negocio_id = p.negocio_id
       and p.busqueda_id = $1
       and p.estado = 'priorizado'
       and exists (
         select 1 from correos co
           join contactos c2 on c2.id = co.contacto_id
          where lower(c2.email) = lower(ct.email)
       )
       and p.razon not like '%buzón compartido%'`,
    [busquedaId],
  );

  return r;
}
