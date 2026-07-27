/**
 * Prueba la Fase 1 de punta a punta contra la base REAL, con datos de fixture.
 *
 *   npm run probar:fase1
 *
 * No necesita credenciales de Google: el lector de Places se inyecta desde
 * `src/fixtures/`. Sí necesita `DATABASE_URL`, porque el punto es probar la
 * persistencia y el dedup de verdad, no simularlos.
 *
 * Limpia lo que crea al terminar (todo lleva marca `FIXTURE_` / `[PRUEBA]`).
 */

import {
  buscar,
  buscarConTroceo,
  esProspectable,
  normalizarNombre,
} from '../servicios/placesService.ts';
import { registrarBusqueda, guardarDescubrimiento, pendientesDeContacto } from '../servicios/negocioService.ts';
import { lectorDeFixture, TOTAL_EN_FIXTURE } from '../fixtures/places-restaurantes-panama.ts';
import { poolPostgres, cerrarPostgres } from '../core/postgres.ts';
import type { SearchSpec } from '../dominio/tipos.ts';

const MARCA = '[PRUEBA] sitio web premium';

let fallos = 0;
let pruebas = 0;

function afirmar(condicion: boolean, desc: string, detalle = ''): void {
  pruebas += 1;
  if (condicion) {
    console.log(`  ok    ${desc}`);
  } else {
    fallos += 1;
    console.log(`  FALLA ${desc}${detalle === '' ? '' : `\n        ${detalle}`}`);
  }
}

const lector = lectorDeFixture();
const SPEC: SearchSpec = {
  producto: MARCA,
  categoria: 'restaurantes',
  ubicacion: 'Ciudad de Panamá',
  canal: 'google_maps',
};

async function limpiar(): Promise<void> {
  const p = poolPostgres();
  // Las prospecciones y contactos caen por ON DELETE CASCADE.
  await p.query(`delete from negocios where place_id like 'FIXTURE_%'`);
  await p.query(`delete from busquedas where producto like '[PRUEBA]%'`);
}

try {
  await limpiar(); // por si quedó algo de una corrida anterior

  console.log('\n=== DESCUBRIMIENTO (fixture, sin llamar a Google) ===\n');

  const { negocios, llamadas, huboMas } = await buscar(SPEC, { limite: 60, lector });

  afirmar(
    negocios.length === TOTAL_EN_FIXTURE,
    `trae los ${TOTAL_EN_FIXTURE} negocios del fixture`,
    `obtuvo ${negocios.length}`,
  );
  afirmar(llamadas === 2, 'paginó: 2 llamadas (5 + 1)', `llamadas=${llamadas}`);
  afirmar(!huboMas, 'detectó que no hay más páginas');

  // El caso que motivó el fix del dedup: dos sucursales de una cadena.
  const terrazas = negocios.filter((n) => n.dominio === 'laterraza.com.pa');
  afirmar(terrazas.length === 2, 'las 2 sucursales de la cadena vienen separadas');
  afirmar(
    terrazas[0]!.place_id !== terrazas[1]!.place_id,
    'las sucursales tienen place_id distinto → esa es la clave de dedup correcta',
  );
  afirmar(
    terrazas[0]!.dominio === terrazas[1]!.dominio,
    'las sucursales COMPARTEN dominio → por eso el dominio no sirve para deduplicar negocios',
  );
  afirmar(
    normalizarNombre('Farmacia Arrocha, S.A.') === normalizarNombre('FARMACIA ARROCHA S.A.'),
    'la normalización de nombre ignora mayúsculas y sufijo societario',
  );

  const sinWeb = negocios.filter((n) => n.sitio_web === null);
  afirmar(sinWeb.length === 1, 'detecta 1 negocio sin sitio web', `encontró ${sinWeb.length}`);

  const cerrados = negocios.filter((n) => !esProspectable(n));
  afirmar(cerrados.length === 1, 'detecta 1 negocio cerrado permanentemente');

  console.log('\n=== PERSISTENCIA + DEDUP ===\n');

  const busquedaId = await registrarBusqueda(SPEC, 'lista_jefe');
  afirmar(busquedaId.length > 0, 'registra la búsqueda (el "por qué" de la corrida)');

  const r1 = await guardarDescubrimiento(busquedaId, negocios);
  afirmar(r1.negociosNuevos === 6, '1ª corrida: 6 negocios nuevos', JSON.stringify(r1));
  afirmar(
    r1.prospeccionesNuevas === 5,
    '1ª corrida: 5 prospecciones (el cerrado NO se prospecta)',
    `nuevas=${r1.prospeccionesNuevas} omitidos=${r1.omitidosNoProspectables}`,
  );
  afirmar(r1.omitidosNoProspectables === 1, 'el cerrado permanentemente queda guardado pero sin prospección');

  // Idempotencia: la misma búsqueda otra vez no debe duplicar nada.
  const r2 = await guardarDescubrimiento(busquedaId, negocios);
  afirmar(
    r2.negociosNuevos === 0 && r2.negociosActualizados === 6,
    '2ª corrida: 0 negocios nuevos, 6 actualizados',
    JSON.stringify(r2),
  );
  afirmar(
    r2.prospeccionesNuevas === 0 && r2.prospeccionesRepetidas === 5,
    '2ª corrida: 0 prospecciones nuevas (idempotente)',
    JSON.stringify(r2),
  );

  const { rows: cuentaNegocios } = await poolPostgres().query<{ n: string }>(
    `select count(*)::text as n from negocios where place_id like 'FIXTURE_%'`,
  );
  afirmar(
    cuentaNegocios[0]!.n === '6',
    'la base tiene 6 negocios, no 12',
    `tiene ${cuentaNegocios[0]!.n}`,
  );

  console.log('\n=== FIX (a) y (c): el mismo negocio en OTRA búsqueda ===\n');

  const spec2: SearchSpec = { ...SPEC, producto: `${MARCA} / automatización` };
  const busqueda2 = await registrarBusqueda(spec2, 'lista_jefe');
  const r3 = await guardarDescubrimiento(busqueda2, negocios);

  afirmar(
    r3.negociosNuevos === 0,
    '(a) segunda búsqueda: NO duplica negocios',
    JSON.stringify(r3),
  );
  afirmar(
    r3.prospeccionesNuevas === 5,
    '(a) segunda búsqueda: SÍ crea 5 prospecciones nuevas',
    JSON.stringify(r3),
  );

  const { rows: prospPorNegocio } = await poolPostgres().query<{ n: string }>(
    `select count(*)::text as n from prospecciones p
     join negocios ng on ng.id = p.negocio_id
     where ng.place_id = 'FIXTURE_places/ChIJfogon001'`,
  );
  afirmar(
    prospPorNegocio[0]!.n === '2',
    '(c) un negocio, 2 prospecciones = 2 productos rastreados por separado',
    `prospecciones=${prospPorNegocio[0]!.n}`,
  );

  console.log('\n=== ENTRADA DE LA FASE 2 ===\n');

  const pendientes = await pendientesDeContacto(busquedaId);
  afirmar(
    pendientes.length === 4,
    'quedan 4 pendientes de contacto (con web, sin email, no cerrados)',
    `son ${pendientes.length}: ${pendientes.map((p) => p.nombre).join(', ')}`,
  );
  afirmar(
    pendientes.every((p) => p.sitioWeb !== null),
    'todos los pendientes tienen sitio web',
  );
  afirmar(
    pendientes[0]!.nombre.includes('Chela') === false,
    'el que no tiene web NO está en la cola de la Fase 2',
  );

  console.log('\n=== TROCEO (pasar el techo de ~60) ===\n');

  const zonas = ['Bella Vista, Panamá', 'El Cangrejo, Panamá', 'Obarrio, Panamá'];
  const t = await buscarConTroceo(SPEC, zonas, { lector });

  afirmar(
    t.negocios.length === TOTAL_EN_FIXTURE,
    'dedup entre zonas: 6 únicos, no 18',
    `únicos=${t.negocios.length}`,
  );
  afirmar(
    t.duplicadosDescartados === TOTAL_EN_FIXTURE * (zonas.length - 1),
    `descartó ${TOTAL_EN_FIXTURE * (zonas.length - 1)} duplicados entre zonas`,
    `descartados=${t.duplicadosDescartados}`,
  );
  afirmar(t.llamadas === zonas.length * 2, 'contabiliza las llamadas (lo que se factura)', `llamadas=${t.llamadas}`);
  console.log(`        llamadas por zona: ${JSON.stringify(t.porZona)}`);
  console.log(`        → 3 zonas = ${t.llamadas} llamadas. Con 40 zonas serían ~${(t.llamadas / zonas.length) * 40}.`);

  console.log(`\n${'='.repeat(64)}`);
  if (fallos === 0) {
    console.log(`OK — ${pruebas} comprobaciones, 0 fallos.`);
    console.log('Fase 1 funciona: descubre, deduplica, persiste y es idempotente.');
    console.log('Falta cambiar el fixture por la llamada real a Places.');
  } else {
    console.log(`${fallos} FALLO(S) de ${pruebas} comprobaciones.`);
    process.exitCode = 1;
  }
  console.log('='.repeat(64));
} finally {
  await limpiar();
  console.log('\n  (datos de prueba borrados: la base queda limpia)');
  await cerrarPostgres();
}
