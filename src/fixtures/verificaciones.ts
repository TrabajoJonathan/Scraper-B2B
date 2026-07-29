/**
 * ============================================================================
 * RESPUESTAS SINTÉTICAS de MillionVerifier. No salieron de la API real.
 * ============================================================================
 *
 * La estructura sí es la real (campos `result`, `role`, `free`, `credits`).
 *
 * Los emails son los que la Fase 2 extrae de los fixtures de sitios web, para
 * que las tres fases encadenen. El reparto está elegido a propósito:
 *
 *  - info@elfogonpanameno.com.pa  → ok        (camino feliz)
 *  - reservas@laterraza.com.pa    → ok        COMPARTIDO por 2 negocios:
 *    demuestra que UNA llamada actualiza DOS filas de `contactos`
 *  - ventas@sushikobe.pa          → catch_all queda fuera de la puerta de envío
 *
 * Los últimos cuatro no aparecen en el pipeline: están para probar la tabla de
 * traducción de forma directa.
 */

import type { RespuestaVerificacion, Verificador } from '../core/millionverifier.ts';

const RESPUESTAS: Record<string, RespuestaVerificacion> = {
  'info@elfogonpanameno.com.pa': {
    email: 'info@elfogonpanameno.com.pa',
    result: 'ok',
    resultcode: 1,
    quality: 'good',
    role: true, // buzón de rol: menos "dato personal" bajo Ley 81
    free: false,
    credits: 4998,
    error: '',
    livemode: true,
  },

  // El caso importante: este email está en 2 negocios (las 2 sucursales).
  'reservas@laterraza.com.pa': {
    email: 'reservas@laterraza.com.pa',
    result: 'ok',
    resultcode: 1,
    quality: 'good',
    role: true,
    free: false,
    credits: 4997,
    error: '',
    livemode: true,
  },

  'ventas@sushikobe.pa': {
    email: 'ventas@sushikobe.pa',
    result: 'catch_all',
    resultcode: 2,
    quality: 'risky',
    role: true,
    free: false,
    credits: 4996,
    error: '',
    livemode: true,
  },

  // --- solo para probar la traducción, no entran al pipeline ---
  'muerto@dominioinexistente.pa': {
    email: 'muerto@dominioinexistente.pa',
    result: 'invalid',
    resultcode: 5,
    quality: 'bad',
    role: false,
    free: false,
    error: '',
  },
  'temporal@mailinator.com': {
    email: 'temporal@mailinator.com',
    result: 'disposable',
    resultcode: 4,
    quality: 'bad',
    role: false,
    free: true,
    error: '',
  },
  'nose@servidorlento.pa': {
    email: 'nose@servidorlento.pa',
    result: 'unknown',
    resultcode: 3,
    quality: 'risky',
    role: false,
    free: false,
    error: '',
  },
  'persona@empresa.com.pa': {
    email: 'persona@empresa.com.pa',
    result: 'ok',
    resultcode: 1,
    quality: 'good',
    role: false, // buzón de una persona, no de rol
    free: false,
    error: '',
  },
};

/** Verificador de fixture. Cuenta las llamadas, para poder afirmar sobre costo. */
export function verificadorDeFixture(): Verificador & { llamadas: () => number } {
  let n = 0;
  const fn = async (email: string): Promise<RespuestaVerificacion> => {
    n += 1;
    const r = RESPUESTAS[email.toLowerCase()];
    if (r === undefined) {
      // Un email que el fixture no conoce. Se comporta como el proveedor con un
      // dominio raro: no sabe.
      return { email, result: 'unknown', resultcode: 3, error: '' };
    }
    return r;
  };
  return Object.assign(fn, { llamadas: () => n });
}

/**
 * Simula la falla de configuración: llave inválida o sin créditos. El proveedor
 * responde HTTP 200 con `error` lleno, así que hay que distinguirlo de un
 * resultado — si no, marcaríamos emails buenos como malos.
 */
export function verificadorQueFalla(): Verificador {
  return async () => {
    throw new Error('MillionVerifier: Invalid API key or no credits left');
  };
}
