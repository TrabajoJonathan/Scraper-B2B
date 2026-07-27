/**
 * Cliente de Claude.
 *
 * Capa: core. Sabe COMO hablarle a la API. No sabe QUE decirle: los prompts
 * viven en `servicios/` (redaccionService, cerebroService, scoringService).
 */

import Anthropic from '@anthropic-ai/sdk';
import { requerido } from './config.ts';

/**
 * Decision del jefe: Haiku 4.5 (barato y suficiente).
 * Precio verificado 2026-07-25: $1.00 input / $5.00 output por millon de tokens.
 */
export const MODELO_BARATO = 'claude-haiku-4-5';

/**
 * Reservado para cuentas de alto ticket (Linea 2 - IA local, $5-20K).
 * $3.00 / $15.00 por millon ($2/$10 promocional hasta 2026-08-31).
 */
export const MODELO_BUENO = 'claude-sonnet-5';

let cliente: Anthropic | undefined;

export function clienteClaude(): Anthropic {
  if (cliente === undefined) {
    cliente = new Anthropic({ apiKey: requerido('ANTHROPIC_API_KEY') });
  }
  return cliente;
}

/**
 * Pide una respuesta que cumpla un JSON Schema. La API garantiza la forma,
 * asi que no hace falta parsear texto libre ni reintentar por formato.
 *
 * Dos avisos especificos de Haiku 4.5:
 *
 *  - NO acepta `output_config.effort` (da error). Solo pasamos `format`.
 *  - El minimo cacheable de Haiku 4.5 es 4096 tokens. Nuestro system prompt
 *    ronda los 1500, asi que el prompt caching NO se activa: pedirlo solo
 *    ensucia el codigo sin ahorrar nada. Si el system prompt llegara a crecer
 *    por encima de 4096, ahi si vale la pena activarlo.
 */
export async function generarEstructurado<T>(opciones: {
  modelo?: string;
  system: string;
  usuario: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<{ resultado: T; uso: Anthropic.Usage; modelo: string }> {
  const modelo = opciones.modelo ?? MODELO_BARATO;

  const respuesta = await clienteClaude().messages.create({
    model: modelo,
    max_tokens: opciones.maxTokens ?? 2000,
    system: opciones.system,
    messages: [{ role: 'user', content: opciones.usuario }],
    output_config: {
      format: { type: 'json_schema', schema: opciones.schema },
    },
  });

  // Con `output_config.format`, Claude puede rechazar por seguridad. En ese
  // caso el contenido NO cumple el schema; hay que mirar stop_reason primero.
  if (respuesta.stop_reason === 'refusal') {
    throw new Error(
      'Claude rechazo la peticion (stop_reason: refusal). ' +
        'Revisar el prompt; no reintentar igual.',
    );
  }
  if (respuesta.stop_reason === 'max_tokens') {
    throw new Error(
      `Respuesta truncada por max_tokens (${opciones.maxTokens ?? 2000}). ` +
        'El JSON quedo incompleto: subir max_tokens.',
    );
  }

  const bloque = respuesta.content.find((b) => b.type === 'text');
  if (bloque === undefined || bloque.type !== 'text') {
    throw new Error('Claude no devolvio bloque de texto.');
  }

  return {
    resultado: JSON.parse(bloque.text) as T,
    uso: respuesta.usage,
    modelo: respuesta.model,
  };
}

/** Costo en USD de una llamada, con los precios de la tabla de arriba. */
export function costoUSD(uso: Anthropic.Usage, modelo: string): number {
  const tarifas: Record<string, { entrada: number; salida: number }> = {
    'claude-haiku-4-5': { entrada: 1.0, salida: 5.0 },
    'claude-sonnet-5': { entrada: 3.0, salida: 15.0 },
  };
  // Prefijo, porque la API devuelve el id con sufijo de fecha.
  const clave = Object.keys(tarifas).find((k) => modelo.startsWith(k));
  const t = clave === undefined ? undefined : tarifas[clave];
  if (t === undefined) return 0;
  return (uso.input_tokens / 1e6) * t.entrada + (uso.output_tokens / 1e6) * t.salida;
}
