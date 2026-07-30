/**
 * Pool de conexiones a Postgres.
 *
 * Capa: core.
 *
 * ¿Por qué esto y no `core/supabase.ts`? Dos clientes para dos trabajos:
 *
 *  - **`postgres.ts` (este)** — el pipeline: upserts con `on conflict`,
 *    transacciones, escrituras en lote. Cosas que la API REST no hace bien.
 *  - **`supabase.ts`** — el panel de la Fase 6: lecturas con RLS desde el
 *    navegador, autenticación, realtime.
 *
 * Usa `DATABASE_URL`, o sea la contraseña de la base: solo servidor.
 */

import pg from 'pg';
import { requerido } from './config.ts';

let pool: pg.Pool | undefined;

export function poolPostgres(): pg.Pool {
  if (pool === undefined) {
    pool = new pg.Pool({
      connectionString: requerido('DATABASE_URL'),
      // Supabase exige TLS y usa un CA propio.
      ssl: { rejectUnauthorized: false },
      max: 4,
      // Más corto que el timeout del pooler de Supabase: preferimos cerrar
      // nosotros una conexión ociosa antes de que nos la cierren.
      idleTimeoutMillis: 8_000,
      keepAlive: true,

      // ===================================================================
      // Dos timeouts que convierten un cuelgue en un error legible
      // ===================================================================
      // Sin esto, una consulta que se traba o una transacción que quedó
      // abierta dejan el proceso esperando para siempre — y en un cron eso
      // significa un job zombi que nadie ve.
      statement_timeout: 30_000,
      idle_in_transaction_session_timeout: 20_000,
    });

    // ===================================================================
    // OBLIGATORIO: pg.Pool emite 'error' y sin manejador Node MATA el proceso
    // ===================================================================
    // El pooler de Supabase cierra las conexiones ociosas por su cuenta. Cuando
    // lo hace, el cliente ocioso del pool emite 'error'. Sin este manejador,
    // Node lo trata como excepción no capturada y aborta.
    //
    // Lo encontró `npm run probar:fase5`: el proceso se cayó a mitad de la
    // prueba con "Connection terminated unexpectedly". En el cron de la Fase 7,
    // que va a tener el pool abierto entre corridas, habría sido una caída
    // silenciosa cada tanto.
    //
    // No hay que reconectar a mano: el pool descarta ese cliente y crea otro en
    // el próximo `connect()`. Solo hay que no morirse.
    pool.on('error', (error) => {
      console.error(`[postgres] conexión ociosa cerrada: ${error.message}`);
    });
  }
  return pool;
}

/** Cierra el pool. Llamar al final de un script para que Node pueda salir. */
export async function cerrarPostgres(): Promise<void> {
  if (pool !== undefined) {
    await pool.end();
    pool = undefined;
  }
}

/**
 * Corre una función dentro de una transacción. Hace commit si sale bien y
 * rollback si lanza. Toma una conexión dedicada del pool (necesario: `BEGIN`
 * en una conexión y `COMMIT` en otra no es una transacción).
 */
export async function enTransaccion<T>(
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await poolPostgres().connect();
  try {
    await cliente.query('begin');
    const resultado = await fn(cliente);
    await cliente.query('commit');
    return resultado;
  } catch (error) {
    await cliente.query('rollback');
    throw error;
  } finally {
    cliente.release();
  }
}
