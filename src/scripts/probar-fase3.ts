/**
 * Prueba la Fase 3 (verificación de emails) contra la base REAL, con respuestas
 * de fixture — sin gastar créditos de MillionVerifier.
 *
 *   npm run probar:fase3
 *
 * Encadena las tres fases: descubrir (fixture de Places) → extraer contacto
 * (fixture de HTML) → verificar (fixture de MillionVerifier). Así se prueba que
 * el pipeline funciona ENTERO, no cada pieza por separado.
 */

import { buscar } from '../servicios/placesService.ts';
import { extraerContacto } from '../servicios/contactoService.ts';
import {
  registrarBusqueda,
  guardarDescubrimiento,
  registrarContacto,
  pendientesDeContacto,
  marcarSinWeb,
} from '../servicios/negocioService.ts';
import { traducir, verificarPendientes, buzonesCompartidos } from '../servicios/verificarService.ts';
import { lectorDeFixture } from '../fixtures/places-restaurantes-panama.ts';
import { traerDeFixture } from '../fixtures/sitios-web-panama.ts';
import { verificadorDeFixture, verificadorQueFalla } from '../fixtures/verificaciones.ts';
import { poolPostgres, cerrarPostgres } from '../core/postgres.ts';
import { SE_PUEDE_APROBAR_ENVIO } from '../dominio/estados.ts';
import type { SearchSpec } from '../dominio/tipos.ts';

const MARCA = '[PRUEBA-F3] sitio web premium';

let fallos = 0;
let pruebas = 0;

function afirmar(condicion: boolean, desc: string, detalle = ''): void {
  pruebas += 1;
  if (condicion) console.log(`  ok    ${desc}`);
  else {
    fallos += 1;
    console.log(`  FALLA ${desc}${detalle === '' ? '' : `\n        ${detalle}`}`);
  }
}

async function limpiar(): Promise<void> {
  const p = poolPostgres();
  await p.query(`delete from negocios where place_id like 'FIXTURE_%'`);
  await p.query(`delete from busquedas where producto like '[PRUEBA-F3]%'`);
}

try {
  await limpiar();

  // -------------------------------------------------------------------------
  console.log('\n=== TABLA DE TRADUCCIÓN (función pura, sin API ni base) ===\n');

  afirmar(traducir('ok') === 'verificado', "ok → verificado");
  afirmar(traducir('catch_all') === 'catch_all', 'catch_all → catch_all');
  afirmar(traducir('invalid') === 'invalido', 'invalid → invalido');
  afirmar(
    traducir('disposable') === 'invalido',
    'disposable → invalido (correo temporal: no vale escribirle a un negocio)',
  );
  afirmar(
    traducir('unknown') === 'no_encontrado',
    'unknown → no_encontrado (NO invalido: el servidor no contestó, puede servir)',
  );
  afirmar(
    traducir('un_valor_nuevo_del_proveedor') === 'no_encontrado',
    'valor desconocido → no_encontrado (conservador: no se envía, pero no se afirma que es malo)',
  );

  // -------------------------------------------------------------------------
  console.log('\n=== PIPELINE COMPLETO: descubrir → contacto → verificar ===\n');

  const spec: SearchSpec = {
    producto: MARCA,
    categoria: 'restaurantes',
    ubicacion: 'Ciudad de Panamá',
    canal: 'google_maps',
  };
  const busquedaId = await registrarBusqueda(spec, 'lista_jefe');

  const { negocios } = await buscar(spec, { limite: 60, lector: lectorDeFixture() });
  await guardarDescubrimiento(busquedaId, negocios);

  const traer = traerDeFixture();
  for (const p of await pendientesDeContacto(busquedaId)) {
    const c = await extraerContacto(p.sitioWeb, p.dominio, { traer });
    await registrarContacto(p.negocioId, p.prospeccionId, {
      email: c.email, redes: c.redes, origen: c.origen, ofuscado: c.ofuscado,
    });
  }
  await marcarSinWeb(busquedaId);

  const { rows: antes } = await poolPostgres().query<{ n: string }>(
    `select count(*)::text as n from contactos c
       join prospecciones p on p.negocio_id = c.negocio_id
     where p.busqueda_id = $1 and c.estado_verificacion = 'pendiente'`,
    [busquedaId],
  );
  console.log(`  (${antes[0]!.n} filas de contactos en estado 'pendiente')\n`);

  // -------------------------------------------------------------------------
  console.log('=== LA DECISIÓN CENTRAL: 1 llamada, N filas ===\n');

  const verificador = verificadorDeFixture();
  const r = await verificarPendientes(busquedaId, { verificador });

  console.log(`        emails únicos          : ${r.emailsUnicos}`);
  console.log(`        llamadas a la API      : ${r.llamadas}`);
  console.log(`        filas actualizadas     : ${r.filasActualizadas}`);
  console.log(`        llamadas AHORRADAS     : ${r.llamadasAhorradas}`);
  console.log(`        buzones de rol         : ${r.buzonesDeRol}`);
  console.log(`        por estado             : ${JSON.stringify(r.porEstado)}`);
  console.log(`        costo                  : $${r.costoUSD.toFixed(5)} USD\n`);

  afirmar(r.emailsUnicos === 3, '3 emails únicos (no 4 filas)', `únicos=${r.emailsUnicos}`);
  afirmar(r.llamadas === 3, 'solo 3 llamadas a la API', `llamadas=${r.llamadas}`);
  afirmar(
    r.filasActualizadas === 4,
    '4 filas actualizadas con 3 llamadas → la propagación funciona',
    `filas=${r.filasActualizadas}`,
  );
  afirmar(
    r.llamadasAhorradas === 1,
    '1 verificación ahorrada (el buzón que comparten las 2 sucursales)',
    `ahorradas=${r.llamadasAhorradas}`,
  );
  afirmar(
    verificador.llamadas() === 3,
    'el contador del fixture confirma 3 llamadas (no se verificó de más)',
    `contador=${verificador.llamadas()}`,
  );

  // Consistencia: las 2 sucursales DEBEN quedar en el mismo estado.
  const { rows: sucursales } = await poolPostgres().query<{ estado: string; n: string }>(
    `select estado_verificacion as estado, count(*)::text as n from contactos
     where lower(email) = 'reservas@laterraza.com.pa' group by estado_verificacion`,
    [],
  );
  afirmar(
    sucursales.length === 1 && sucursales[0]!.n === '2',
    'las 2 sucursales quedaron en el MISMO estado (sin verificar dos veces no hay inconsistencia)',
    JSON.stringify(sucursales),
  );

  // -------------------------------------------------------------------------
  console.log('\n=== METADATA QUE VIENE GRATIS EN LA MISMA LLAMADA ===\n');

  const { rows: meta } = await poolPostgres().query<{
    email: string; estado: string; es_rol: boolean | null; tiene_fecha: boolean;
  }>(
    `select c.email, c.estado_verificacion as estado, c.es_rol,
            (c.verificado_en is not null) as tiene_fecha
     from contactos c join prospecciones p on p.negocio_id = c.negocio_id
     where p.busqueda_id = $1 and c.email is not null
     order by c.email`,
    [busquedaId],
  );
  for (const m of meta) {
    console.log(
      `        ${m.email.padEnd(32)} ${m.estado.padEnd(12)} rol=${String(m.es_rol).padEnd(5)} fecha=${m.tiene_fecha}`,
    );
  }
  afirmar(meta.every((m) => m.tiene_fecha), 'todas tienen verificado_en (se sabe CUÁNDO se verificó)');
  afirmar(
    meta.every((m) => m.es_rol !== null),
    'todas tienen es_rol resuelto (argumento legal bajo Ley 81)',
  );
  afirmar(
    meta.filter((m) => m.es_rol === true).length === 4,
    'las 4 son buzones de rol → "no identifican a una persona" es un dato, no una opinión',
  );

  // -------------------------------------------------------------------------
  console.log('\n=== IDEMPOTENCIA: no se paga dos veces ===\n');

  const verificador2 = verificadorDeFixture();
  const r2 = await verificarPendientes(busquedaId, { verificador: verificador2 });
  afirmar(r2.llamadas === 0, 'segunda corrida: 0 llamadas (ya no hay pendientes)', `llamadas=${r2.llamadas}`);
  afirmar(r2.costoUSD === 0, 'segunda corrida: costo $0');

  // Pero con re-verificación forzada sí debe volver a llamar.
  await poolPostgres().query(
    `update contactos set verificado_en = now() - interval '200 days'
     where lower(email) = 'info@elfogonpanameno.com.pa'`,
  );
  const r3 = await verificarPendientes(busquedaId, {
    verificador: verificadorDeFixture(),
    reverificarDespuesDeDias: 90,
  });
  afirmar(
    r3.llamadas === 1,
    're-verifica solo lo vencido a más de 90 días (la validez del email caduca)',
    `llamadas=${r3.llamadas}`,
  );

  // -------------------------------------------------------------------------
  console.log('\n=== LA PUERTA DE ENVÍO ===\n');

  const compartidos = await buzonesCompartidos(busquedaId);
  afirmar(
    compartidos.length === 1 && compartidos[0]!.negocios === 2,
    'buzonesCompartidos() detecta el buzón de la cadena (el "dedup fino")',
    JSON.stringify(compartidos),
  );

  const { rows: puerta } = await poolPostgres().query<{ estado: string; n: string }>(
    `select c.estado_verificacion as estado, count(*)::text as n
     from contactos c join prospecciones p on p.negocio_id = c.negocio_id
     where p.busqueda_id = $1 and c.email is not null
     group by c.estado_verificacion order by c.estado_verificacion`,
    [busquedaId],
  );
  for (const p of puerta) {
    const pasa = SE_PUEDE_APROBAR_ENVIO[p.estado as keyof typeof SE_PUEDE_APROBAR_ENVIO];
    console.log(`        ${p.estado.padEnd(14)} ${p.n} fila(s)  →  ${pasa ? 'ENVIABLE' : 'bloqueado'}`);
  }
  afirmar(
    puerta.some((p) => p.estado === 'verificado' && p.n === '3'),
    '3 filas verificadas (Fogón + las 2 sucursales)',
    JSON.stringify(puerta),
  );
  afirmar(
    puerta.some((p) => p.estado === 'catch_all' && p.n === '1'),
    '1 fila catch_all → decisión #6 resuelta (2026-08-04): ya es aprobable, decide el empleado',
    JSON.stringify(puerta),
  );

  // -------------------------------------------------------------------------
  console.log('\n=== FALLA DE CONFIGURACIÓN ≠ RESULTADO ===\n');

  await poolPostgres().query(
    `update contactos set estado_verificacion='pendiente', verificado_en=null
     where lower(email)='info@elfogonpanameno.com.pa'`,
  );
  let reventó = false;
  try {
    await verificarPendientes(busquedaId, { verificador: verificadorQueFalla() });
  } catch {
    reventó = true;
  }
  afirmar(
    reventó,
    'llave inválida / sin créditos REVIENTA en vez de marcar emails buenos como malos',
  );
  const { rows: intacto } = await poolPostgres().query<{ estado: string }>(
    `select estado_verificacion as estado from contactos
     where lower(email)='info@elfogonpanameno.com.pa'`,
  );
  afirmar(
    intacto[0]!.estado === 'pendiente',
    'y el email queda "pendiente", no marcado erróneamente',
    `quedó en ${intacto[0]!.estado}`,
  );

  console.log(`\n${'='.repeat(66)}`);
  if (fallos === 0) {
    console.log(`OK — ${pruebas} comprobaciones, 0 fallos.`);
    console.log('Fase 3 funciona: 1 llamada por email único, propaga, no re-cobra,');
    console.log('y distingue una falla de configuración de un veredicto real.');
  } else {
    console.log(`${fallos} FALLO(S) de ${pruebas} comprobaciones.`);
    process.exitCode = 1;
  }
  console.log('='.repeat(66));
} finally {
  await limpiar();
  console.log('\n  (datos de prueba borrados)');
  await cerrarPostgres();
}
