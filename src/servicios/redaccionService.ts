/**
 * redaccionService — el primer correo por lead (Fase 5).
 *
 * Capa: servicios. Aqui vive el PROMPT; el core solo sabe hablarle a la API.
 */

import { generarEstructurado, costoUSD, MODELO_BARATO } from '../core/claude.ts';
import type { NegocioDescubierto } from '../dominio/tipos.ts';

/**
 * System prompt. Estable a proposito (si algun dia pasa de 4096 tokens, se
 * vuelve cacheable en Haiku 4.5 y conviene activar prompt caching).
 *
 * Las reglas salen del diseno en investigacion/05-claude-redaccion.md.
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

export async function redactar(opciones: {
  negocio: NegocioDescubierto;
  /** El producto que se quiere vender (viene del searchSpec). */
  producto: string;
  modelo?: string;
}): Promise<{ borrador: Borrador; modelo: string; costoUSD: number }> {
  const { negocio, producto } = opciones;

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

  const { resultado, uso, modelo } = await generarEstructurado<Borrador>({
    modelo: opciones.modelo ?? MODELO_BARATO,
    system: SYSTEM,
    usuario,
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1500,
  });

  return { borrador: resultado, modelo, costoUSD: costoUSD(uso, modelo) };
}
