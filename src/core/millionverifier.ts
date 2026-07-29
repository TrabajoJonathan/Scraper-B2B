/**
 * Cliente crudo de MillionVerifier.
 *
 * Capa: core. Habla HTTP y devuelve lo que el proveedor manda, sin interpretar.
 * Traducir su vocabulario al nuestro es una decisión de negocio y vive en
 * `servicios/verificarService.ts`.
 *
 * ¿Por qué MillionVerifier y no otro? Es el más barato de los serios
 * (~$0.0037/email) y su API es un solo GET sin autenticación por header. Ver
 * PROPUESTA-TECNICA §3 para la comparación con Bouncer.
 */

import { requerido } from './config.ts';

const ENDPOINT = 'https://api.millionverifier.com/api/v3/';

/**
 * Respuesta de MillionVerifier. Los campos que nos importan:
 *
 *  - `result`   — el veredicto: ok | catch_all | unknown | disposable | invalid
 *  - `role`     — true si es buzón de rol (info@, ventas@) y no de una persona
 *  - `free`     — true si es un proveedor gratuito (gmail, hotmail)
 *  - `credits`  — cuántas verificaciones quedan en la cuenta
 *  - `error`    — string vacío cuando todo salió bien
 */
export type RespuestaVerificacion = {
  email?: string;
  result?: string;
  resultcode?: number;
  subresult?: string;
  quality?: string;
  role?: boolean;
  free?: boolean;
  didyoumean?: string;
  credits?: number;
  executiontime?: number;
  error?: string;
  livemode?: boolean;
};

/** Firma del verificador, para poder inyectar fixtures en pruebas. */
export type Verificador = (email: string) => Promise<RespuestaVerificacion>;

/**
 * Verifica un email contra la API real.
 *
 * `timeout` es el que el proveedor espera al servidor de correo del destino.
 * 10s es su recomendación: más bajo devuelve `unknown` de más, más alto hace la
 * corrida lenta sin mejorar mucho.
 */
export async function verificarEmail(email: string): Promise<RespuestaVerificacion> {
  const apiKey = requerido('MILLIONVERIFIER_API_KEY');
  const url = new URL(ENDPOINT);
  url.searchParams.set('api', apiKey);
  url.searchParams.set('email', email);
  url.searchParams.set('timeout', '10');

  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });

  if (!r.ok) {
    throw new Error(`MillionVerifier respondió ${r.status} ${r.statusText}`);
  }

  const datos = (await r.json()) as RespuestaVerificacion;

  // El proveedor devuelve 200 con `error` lleno cuando la llave es inválida o
  // se acabaron los créditos. Eso NO es un resultado de verificación: es una
  // falla de configuración, y hay que distinguirla o marcaríamos emails buenos
  // como malos.
  if (datos.error !== undefined && datos.error !== '') {
    throw new Error(`MillionVerifier: ${datos.error}`);
  }

  return datos;
}
