/**
 * Verifica que el esquema en la base real coincida con el diseño congelado.
 *
 *   npm run verificar
 *
 * No es un test unitario: es una prueba de regresión del MODELO. Comprueba que
 * los 4 fixes de arquitectura siguen en pie y que las restricciones muerden de
 * verdad — no solo que las tablas existan.
 *
 * Corre dentro de una transacción que SIEMPRE se revierte, así que no deja
 * datos. Es seguro correrlo contra la base de producción.
 *
 * Es el arranque de la Vía B5 (QA): checklist de regresión por cambio.
 */

import pg from 'pg';
import { requerido } from '../core/config.ts';

const cliente = new pg.Client({
  connectionString: requerido('DATABASE_URL'),
  ssl: { rejectUnauthorized: false },
});

let fallos = 0;
let pruebas = 0;

function ok(desc: string): void {
  pruebas += 1;
  console.log(`  ok   ${desc}`);
}

function falla(desc: string, detalle: string): void {
  pruebas += 1;
  fallos += 1;
  console.log(`  FALLA ${desc}\n        ${detalle}`);
}

function afirmar(condicion: boolean, desc: string, detalle = ''): void {
  if (condicion) ok(desc);
  else falla(desc, detalle);
}

/** Espera que la consulta REVIENTE. Si pasa, la restricción no está mordiendo. */
async function debeFallar(desc: string, sql: string, params: unknown[] = []): Promise<void> {
  try {
    await cliente.query('savepoint sp');
    await cliente.query(sql, params);
    await cliente.query('rollback to savepoint sp');
    falla(desc, 'la sentencia paso, y deberia haber sido rechazada');
  } catch {
    await cliente.query('rollback to savepoint sp');
    ok(desc);
  }
}

await cliente.connect();

try {
  console.log('\n=== ESTRUCTURA ===\n');

  const { rows: tablas } = await cliente.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  const nombres = new Set(tablas.map((t) => t.table_name));

  for (const t of [
    'busquedas',
    'negocios',
    'prospecciones',
    'contactos',
    'correos',
    'supresiones',
  ]) {
    afirmar(nombres.has(t), `existe la tabla ${t}`);
  }

  const { rows: vistas } = await cliente.query<{ table_name: string }>(
    `select table_name from information_schema.views where table_schema = 'public'`,
  );
  const nombresVistas = new Set(vistas.map((v) => v.table_name));
  afirmar(nombresVistas.has('v_correos_enviables'), 'existe la vista v_correos_enviables');
  afirmar(nombresVistas.has('v_buzones_saturados'), 'existe la vista v_buzones_saturados');

  console.log('\n=== LOS 4 FIXES DE ARQUITECTURA ===\n');

  // (a) negocios NO debe tener busqueda_id
  const { rows: colsNegocios } = await cliente.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='negocios'`,
  );
  afirmar(
    !colsNegocios.some((c) => c.column_name === 'busqueda_id'),
    '(a) negocios NO tiene busqueda_id',
    `columnas: ${colsNegocios.map((c) => c.column_name).join(', ')}`,
  );

  // (a) el vinculo vive en prospecciones
  const { rows: fks } = await cliente.query<{ column_name: string; foreign_table: string }>(
    `select kcu.column_name, ccu.table_name as foreign_table
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
     join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
     where tc.table_name = 'prospecciones' and tc.constraint_type = 'FOREIGN KEY'`,
  );
  afirmar(
    fks.some((f) => f.foreign_table === 'negocios') &&
      fks.some((f) => f.foreign_table === 'busquedas'),
    '(a) prospecciones referencia a negocios Y a busquedas',
    `FKs: ${fks.map((f) => `${f.column_name}->${f.foreign_table}`).join(', ')}`,
  );

  // (b) correos cuelga de prospeccion + contacto, NO de negocio
  const { rows: colsCorreos } = await cliente.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='correos'`,
  );
  const nombresCorreos = colsCorreos.map((c) => c.column_name);
  afirmar(nombresCorreos.includes('prospeccion_id'), '(b) correos.prospeccion_id existe');
  afirmar(nombresCorreos.includes('contacto_id'), '(b) correos.contacto_id existe');
  afirmar(
    !nombresCorreos.includes('negocio_id'),
    '(b) correos NO tiene negocio_id',
    `columnas: ${nombresCorreos.join(', ')}`,
  );

  // (c) el estado vive en prospecciones, no en negocios
  afirmar(
    !colsNegocios.some((c) => c.column_name === 'estado'),
    '(c) negocios NO tiene columna estado',
  );
  const { rows: colsProsp } = await cliente.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='prospecciones'`,
  );
  afirmar(
    colsProsp.some((c) => c.column_name === 'estado'),
    '(c) prospecciones.estado existe',
  );

  // (d) supresiones existe y tiene la restriccion XOR
  const { rows: checks } = await cliente.query<{ constraint_name: string }>(
    `select constraint_name from information_schema.table_constraints
     where table_name='supresiones' and constraint_type='CHECK'`,
  );
  afirmar(
    checks.some((c) => c.constraint_name.includes('xor')),
    '(d) supresiones tiene la restriccion email-XOR-dominio',
    `checks: ${checks.map((c) => c.constraint_name).join(', ')}`,
  );

  console.log('\n=== RLS ===\n');
  const { rows: rls } = await cliente.query<{ relname: string; relrowsecurity: boolean }>(
    `select c.relname, c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relkind='r' and c.relname <> '_migraciones'`,
  );
  for (const t of rls) {
    afirmar(t.relrowsecurity, `RLS activo en ${t.relname}`);
  }

  console.log('\n=== LAS RESTRICCIONES MUERDEN? (todo se revierte) ===\n');

  await cliente.query('begin');

  const { rows: b } = await cliente.query<{ id: string }>(
    `insert into busquedas (producto, categoria, ubicacion, canal, fuente)
     values ('prueba', 'restaurantes', 'Ciudad de Panama', 'google_maps', 'lista_jefe')
     returning id`,
  );
  const busquedaId = b[0]!.id;
  ok('inserta una busqueda');

  const { rows: n } = await cliente.query<{ id: string }>(
    `insert into negocios (place_id, nombre, nombre_normalizado, dominio, sitio_web)
     values ('PRUEBA_PLACE_1', 'Restaurante Prueba S.A.', 'restaurante prueba', 'prueba.com.pa', 'https://prueba.com.pa')
     returning id`,
  );
  const negocioId = n[0]!.id;
  ok('inserta un negocio');

  await debeFallar(
    'dedup: rechaza un place_id duplicado',
    `insert into negocios (place_id, nombre, nombre_normalizado)
     values ('PRUEBA_PLACE_1', 'Otro', 'otro')`,
  );

  await debeFallar(
    'rechaza un canal invalido',
    `insert into busquedas (producto, categoria, ubicacion, canal, fuente)
     values ('x','y','z','linkedin','lista_jefe')`,
  );

  const { rows: p } = await cliente.query<{ id: string; estado: string }>(
    `insert into prospecciones (negocio_id, busqueda_id) values ($1,$2)
     returning id, estado`,
    [negocioId, busquedaId],
  );
  const prospeccionId = p[0]!.id;
  afirmar(
    p[0]!.estado === 'negocio_encontrado',
    `estado inicial por defecto = negocio_encontrado`,
    `obtenido: ${p[0]!.estado}`,
  );

  await debeFallar(
    'un solo intento por (negocio x busqueda)',
    `insert into prospecciones (negocio_id, busqueda_id) values ($1,$2)`,
    [negocioId, busquedaId],
  );

  await debeFallar(
    'rechaza un estado de prospeccion invalido',
    `update prospecciones set estado='inventado' where id=$1`,
    [prospeccionId],
  );

  // (c) el MISMO negocio en OTRA busqueda: debe poder tener otro estado.
  const { rows: b2 } = await cliente.query<{ id: string }>(
    `insert into busquedas (producto, categoria, ubicacion, canal, fuente)
     values ('automatizacion de cotizaciones','restaurantes','Ciudad de Panama','google_maps','lista_jefe')
     returning id`,
  );
  await cliente.query(
    `insert into prospecciones (negocio_id, busqueda_id, estado) values ($1,$2,'enviado')`,
    [negocioId, b2[0]!.id],
  );
  const { rows: dos } = await cliente.query<{ n: string }>(
    `select count(*)::text as n from prospecciones where negocio_id=$1`,
    [negocioId],
  );
  afirmar(
    dos[0]!.n === '2',
    '(c) el mismo negocio tiene 2 estados distintos, uno por producto',
    `filas: ${dos[0]!.n}`,
  );

  const { rows: c } = await cliente.query<{ id: string; estado_verificacion: string }>(
    `insert into contactos (negocio_id, email, origen_del_correo)
     values ($1,'info@prueba.com.pa','footer') returning id, estado_verificacion`,
    [negocioId],
  );
  const contactoId = c[0]!.id;
  afirmar(
    c[0]!.estado_verificacion === 'pendiente',
    'estado_verificacion por defecto = pendiente',
    `obtenido: ${c[0]!.estado_verificacion}`,
  );

  await cliente.query(
    `insert into correos (prospeccion_id, contacto_id, asunto, cuerpo, cta, modelo)
     values ($1,$2,'Asunto de prueba','Cuerpo','CTA','claude-haiku-4-5')`,
    [prospeccionId, contactoId],
  );
  ok('(b) inserta un correo atado a (prospeccion, contacto)');

  await debeFallar(
    '(b) un solo borrador por (prospeccion x contacto)',
    `insert into correos (prospeccion_id, contacto_id, asunto, cuerpo, cta, modelo)
     values ($1,$2,'Otro','x','y','z')`,
    [prospeccionId, contactoId],
  );

  /*
   * Puerta de calidad (migración 017, 2026-08-04): ya no exige 'verificado'.
   * Sin MillionVerifier, todo contacto real se queda en 'pendiente' para
   * siempre — con la puerta vieja, la cola de revisión iba a quedar vacía por
   * construcción. Ahora decide el empleado; el único bloqueo automático es
   * 'invalido' (el verificador CONFIRMÓ que el correo no existe).
   */
  const { rows: pendiente } = await cliente.query<{ n: string }>(
    `select count(*)::text as n from v_correos_enviables where contacto_id=$1`,
    [contactoId],
  );
  afirmar(
    pendiente[0]!.n === '1',
    'puerta de calidad: "pendiente" SÍ es enviable — decide el empleado, no MillionVerifier',
    `filas: ${pendiente[0]!.n}`,
  );

  await cliente.query(`update contactos set estado_verificacion='verificado' where id=$1`, [
    contactoId,
  ]);
  const { rows: verificado } = await cliente.query<{ n: string }>(
    `select count(*)::text as n from v_correos_enviables where contacto_id=$1`,
    [contactoId],
  );
  afirmar(
    verificado[0]!.n === '1',
    'puerta de calidad: verificado también es enviable (no cambió)',
    `filas: ${verificado[0]!.n}`,
  );

  await cliente.query(`update contactos set estado_verificacion='invalido' where id=$1`, [
    contactoId,
  ]);
  const { rows: invalido } = await cliente.query<{ n: string }>(
    `select count(*)::text as n from v_correos_enviables where contacto_id=$1`,
    [contactoId],
  );
  afirmar(
    invalido[0]!.n === '0',
    'puerta de calidad: "invalido" SÍ sigue bloqueado — es un hecho técnico, no una decisión',
    `filas: ${invalido[0]!.n}`,
  );

  await cliente.query(`update contactos set estado_verificacion='verificado' where id=$1`, [
    contactoId,
  ]);

  // (d) Puerta de opt-out por email exacto.
  await cliente.query(
    `insert into supresiones (email, motivo) values ('info@prueba.com.pa','opt_out')`,
  );
  const { rows: suprimido } = await cliente.query<{ n: string }>(
    `select count(*)::text as n from v_correos_enviables where contacto_id=$1`,
    [contactoId],
  );
  afirmar(
    suprimido[0]!.n === '0',
    '(d) opt-out por email: deja de ser enviable',
    `filas: ${suprimido[0]!.n}`,
  );

  // (d) Puerta de opt-out por dominio completo.
  await cliente.query(`delete from supresiones where email='info@prueba.com.pa'`);
  await cliente.query(
    `insert into supresiones (dominio, motivo) values ('prueba.com.pa','queja')`,
  );
  const { rows: suprimidoDom } = await cliente.query<{ n: string }>(
    `select count(*)::text as n from v_correos_enviables where contacto_id=$1`,
    [contactoId],
  );
  afirmar(
    suprimidoDom[0]!.n === '0',
    '(d) opt-out por dominio: deja de ser enviable',
    `filas: ${suprimidoDom[0]!.n}`,
  );

  await debeFallar(
    '(d) supresiones rechaza email Y dominio a la vez',
    `insert into supresiones (email, dominio, motivo) values ('a@b.com','b.com','manual')`,
  );
  await debeFallar(
    '(d) supresiones rechaza una fila sin email ni dominio',
    `insert into supresiones (motivo) values ('manual')`,
  );

  // El trigger de actualizada_en
  const { rows: antes } = await cliente.query<{ t: string }>(
    `select actualizada_en::text as t from prospecciones where id=$1`,
    [prospeccionId],
  );
  await cliente.query(`update prospecciones set estado='contacto_encontrado' where id=$1`, [
    prospeccionId,
  ]);
  const { rows: despues } = await cliente.query<{ t: string }>(
    `select actualizada_en::text as t from prospecciones where id=$1`,
    [prospeccionId],
  );
  afirmar(
    antes[0]!.t !== despues[0]!.t,
    'el trigger actualiza actualizada_en al modificar',
    `antes=${antes[0]!.t} despues=${despues[0]!.t}`,
  );

  await cliente.query('rollback');
  console.log('\n  (todo revertido: la base queda igual que antes)');

  console.log(`\n${'='.repeat(60)}`);
  if (fallos === 0) {
    console.log(`OK — ${pruebas} comprobaciones, 0 fallos.`);
    console.log('El esquema real coincide con el diseño congelado.');
  } else {
    console.log(`${fallos} FALLO(S) de ${pruebas} comprobaciones.`);
    process.exitCode = 1;
  }
  console.log('='.repeat(60));
} finally {
  await cliente.end();
}
