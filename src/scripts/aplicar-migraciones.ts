/**
 * Aplica las migraciones de supabase/migraciones/ en orden.
 *
 *   npm run migrar
 *
 * Necesita DATABASE_URL en .env.
 *
 * Por que `pg` y no @supabase/supabase-js: el cliente de Supabase habla con la
 * API REST, que no ejecuta DDL arbitrario. Para crear tablas hay que conectarse
 * a Postgres de verdad.
 *
 * Usa la conexion DIRECTA (puerto 5432), no el pooler (6543): el pooler corre
 * en modo transaccion y algunas sentencias DDL se comportan raro ahi.
 *
 * Es idempotente: lleva registro en la tabla `_migraciones` y solo corre las
 * que faltan. Cada archivo va dentro de su propia transaccion, asi que si una
 * falla, no queda a medias.
 */

import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { requerido } from '../core/config.ts';

const DIR = 'supabase/migraciones';

const cliente = new pg.Client({
  connectionString: requerido('DATABASE_URL'),
  // Supabase exige TLS. No verificamos la cadena porque usa un CA propio.
  ssl: { rejectUnauthorized: false },
});

await cliente.connect();

try {
  await cliente.query(`
    create table if not exists _migraciones (
      archivo     text primary key,
      hash        text not null,
      aplicada_en timestamptz not null default now()
    );
  `);

  const archivos = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();

  if (archivos.length === 0) {
    console.log(`No hay .sql en ${DIR}/`);
    process.exit(0);
  }

  const yaAplicadas = new Map<string, string>(
    (await cliente.query<{ archivo: string; hash: string }>('select archivo, hash from _migraciones'))
      .rows.map((r) => [r.archivo, r.hash]),
  );

  let corridas = 0;

  for (const archivo of archivos) {
    const sql = await readFile(path.join(DIR, archivo), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex').slice(0, 16);
    const hashPrevio = yaAplicadas.get(archivo);

    if (hashPrevio !== undefined) {
      if (hashPrevio !== hash) {
        // Editar una migracion ya aplicada es la forma clasica de que la base
        // de produccion y el repo dejen de coincidir sin que nadie lo note.
        console.warn(
          `  !! ${archivo} ya se aplico pero el archivo CAMBIO.\n` +
            '     No se re-ejecuta. Crea una migracion nueva con el cambio.',
        );
      } else {
        console.log(`  ·  ${archivo} (ya aplicada)`);
      }
      continue;
    }

    process.stdout.write(`  -> ${archivo} ... `);
    try {
      await cliente.query('begin');
      await cliente.query(sql);
      await cliente.query('insert into _migraciones (archivo, hash) values ($1, $2)', [
        archivo,
        hash,
      ]);
      await cliente.query('commit');
      console.log('OK');
      corridas += 1;
    } catch (error) {
      await cliente.query('rollback');
      console.log('FALLO');
      throw error;
    }
  }

  console.log(
    corridas === 0
      ? '\nNada nuevo. El esquema ya esta al dia.'
      : `\n${corridas} migracion(es) aplicada(s).`,
  );
} finally {
  await cliente.end();
}
