/**
 * Prueba la Fase 5 (borradores + flujo de revisión) contra la base REAL, con
 * borradores de fixture — sin gastar créditos de Claude.
 *
 *   npm run probar:fase5
 *
 * Encadena TODO: descubrir → contacto → verificar → priorizar → redactar →
 * revisar. Es la primera vez que el pipeline corre completo de punta a punta.
 */

import { buscar } from '../servicios/placesService.ts';
import { extraerContacto } from '../servicios/contactoService.ts';
import {
  registrarBusqueda, guardarDescubrimiento, registrarContacto,
  pendientesDeContacto, marcarSinWeb,
} from '../servicios/negocioService.ts';
import { verificarPendientes } from '../servicios/verificarService.ts';
import { priorizar, guardarSenalesWeb } from '../servicios/scoringService.ts';
import { generarBorradores } from '../servicios/redaccionService.ts';
import { aprobar, editar, descartar, colaDeRevision } from '../servicios/revisionService.ts';
import { lectorDeFixture } from '../fixtures/places-restaurantes-panama.ts';
import { traerDeFixture } from '../fixtures/sitios-web-panama.ts';
import { verificadorDeFixture } from '../fixtures/verificaciones.ts';
import { generadorDeFixture, generadorQueRechaza } from '../fixtures/borradores.ts';
import { poolPostgres, cerrarPostgres } from '../core/postgres.ts';
import type { SearchSpec } from '../dominio/tipos.ts';

const MARCA = '[PRUEBA-F5] sitio web premium';
const ANIO = 2026;
const ANA = { email: 'ana@code-flow-ai.com' };
const LUIS = { email: 'luis@code-flow-ai.com' };

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
  await p.query(`delete from busquedas where producto like '[PRUEBA-F5]%'`);
  await p.query(`delete from supresiones where email like '%@laterraza.com.pa'`);
}

try {
  await limpiar();

  // =========================================================================
  console.log('\n=== PIPELINE COMPLETO: 1 → 2 → 3 → 4 → 5 ===\n');

  const spec: SearchSpec = {
    producto: MARCA, categoria: 'restaurantes',
    ubicacion: 'Ciudad de Panamá', canal: 'google_maps',
  };
  const busquedaId = await registrarBusqueda(spec, 'lista_jefe');
  const traer = traerDeFixture();

  const { negocios } = await buscar(spec, { limite: 60, lector: lectorDeFixture() });
  await guardarDescubrimiento(busquedaId, negocios);
  for (const p of await pendientesDeContacto(busquedaId)) {
    const c = await extraerContacto(p.sitioWeb, p.dominio, { traer, anioActual: ANIO });
    await registrarContacto(p.negocioId, p.prospeccionId, {
      email: c.email, redes: c.redes, origen: c.origen, ofuscado: c.ofuscado,
    });
    await guardarSenalesWeb(p.negocioId, c.sitioRespondio, c.senalesWeb, c.soloRedes);
  }
  await marcarSinWeb(busquedaId);
  await verificarPendientes(busquedaId, { verificador: verificadorDeFixture() });
  await priorizar(busquedaId, { anioActual: ANIO });

  console.log('  (fases 1-4 corridas: descubrir, contacto, verificar, priorizar)\n');

  // =========================================================================
  console.log('=== UN BORRADOR POR BUZÓN, NO POR PROSPECCIÓN ===\n');

  const gen = generadorDeFixture();
  const g = await generarBorradores(busquedaId, { generador: gen });

  console.log(`        candidatos (buzones únicos) : ${g.candidatos}`);
  console.log(`        borradores generados        : ${g.generados}`);
  console.log(`        omitidos por buzón compartido: ${g.omitidosPorBuzonCompartido}`);
  console.log(`        llamadas al generador       : ${gen.llamadas()}`);
  console.log(`        costo                       : $${g.costoUSD.toFixed(5)} USD\n`);

  afirmar(
    g.candidatos === 2,
    '2 buzones únicos verificados (Fogón y La Terraza; Sushi quedó catch_all)',
    `candidatos=${g.candidatos}`,
  );
  afirmar(
    g.omitidosPorBuzonCompartido === 1,
    '1 prospección omitida: la 2ª sucursal comparte buzón con la 1ª',
    `omitidos=${g.omitidosPorBuzonCompartido}`,
  );
  afirmar(
    gen.llamadas() === g.generados,
    'una llamada por borrador, ni una de más',
    `llamadas=${gen.llamadas()} generados=${g.generados}`,
  );

  const { rows: correos } = await poolPostgres().query<{ n: string }>(
    `select count(*)::text as n from correos co
       join prospecciones p on p.id = co.prospeccion_id
     where p.busqueda_id = $1`,
    [busquedaId],
  );
  afirmar(
    correos[0]!.n === '2',
    '2 correos en la base: uno por buzón, NO uno por sucursal',
    `correos=${correos[0]!.n}`,
  );

  // =========================================================================
  console.log('\n=== LA COLA DE REVISIÓN (lo que verá el empleado) ===\n');

  const cola = await colaDeRevision(busquedaId);
  for (const c of cola) {
    console.log(`        [${c.score}] ${c.negocio}  →  ${c.email}`);
    console.log(`              "${c.asunto}"`);
    if (c.comparteBuzonCon > 0) {
      console.log(`              ⚠️  este buzón lo comparten ${c.comparteBuzonCon + 1} negocios`);
    }
  }
  console.log('');
  afirmar(cola.length === 2, 'la cola trae los 2 aprobables', `cola=${cola.length}`);
  afirmar(
    cola[0]!.score !== null && (cola[1]!.score === null || cola[0]!.score >= cola[1]!.score),
    'viene ordenada por score (el mejor primero)',
  );
  const terrazaEnCola = cola.find((c) => c.negocio.includes('Terraza'));
  afirmar(
    terrazaEnCola !== undefined && terrazaEnCola.comparteBuzonCon > 0,
    'avisa que el buzón de la cadena es compartido (aprobar uno, no dos)',
    `comparte=${terrazaEnCola?.comparteBuzonCon}`,
  );
  afirmar(
    cola.every((c) => c.cuerpo.split(/\s+/).length < 150),
    'los borradores respetan el límite de 150 palabras',
  );

  // =========================================================================
  console.log('\n=== APROBAR: LA AUDITORÍA ES OBLIGATORIA ===\n');

  const primero = cola[0]!;
  const ap = await aprobar(primero.correoId, ANA);
  afirmar(ap.ok, 'Ana aprueba el primero', JSON.stringify(ap));

  const { rows: aud } = await poolPostgres().query<{
    estado: string; email: string | null; tiene_fecha: boolean;
  }>(
    `select estado, aprobado_por_email as email, (aprobado_en is not null) as tiene_fecha
     from correos where id = $1`,
    [primero.correoId],
  );
  afirmar(aud[0]!.estado === 'aprobado', 'queda en estado aprobado');
  afirmar(aud[0]!.email === ANA.email, 'guardó QUIÉN aprobó', `email=${aud[0]!.email}`);
  afirmar(aud[0]!.tiene_fecha, 'guardó CUÁNDO aprobó');

  // La base rechaza aprobar sin autor: la restricción, no la buena memoria.
  let rechazado = false;
  try {
    await poolPostgres().query(
      `update correos set estado='aprobado', aprobado_por_email=null, aprobado_en=null
       where id=$1`,
      [cola[1]!.correoId],
    );
  } catch {
    rechazado = true;
  }
  afirmar(
    rechazado,
    'la BASE rechaza un "aprobado" sin autor (no depende de que el código se acuerde)',
  );

  // =========================================================================
  console.log('\n=== DOS EMPLEADOS, EL MISMO CORREO ===\n');

  const dobleAp = await aprobar(primero.correoId, LUIS);
  afirmar(!dobleAp.ok && dobleAp.motivo === 'ya_aprobado', 'Luis no puede re-aprobar', JSON.stringify(dobleAp));
  afirmar(
    (dobleAp as { detalle?: string }).detalle?.includes(ANA.email) === true,
    'y le dice que ya lo aprobó Ana (no un error genérico)',
    JSON.stringify(dobleAp),
  );

  const { rows: sigueAna } = await poolPostgres().query<{ email: string }>(
    `select aprobado_por_email as email from correos where id=$1`, [primero.correoId],
  );
  afirmar(
    sigueAna[0]!.email === ANA.email,
    'la auditoría de Ana NO fue sobrescrita por el segundo intento',
  );

  // =========================================================================
  console.log('\n=== LAS PUERTAS SE EXIGEN AL ESCRIBIR, NO SOLO AL LEER ===\n');

  const segundo = cola[1]!;
  // El opt-out se agrega DESPUÉS de que el correo entró a la cola: simula que el
  // negocio pidió no ser contactado mientras el borrador esperaba revisión.
  await poolPostgres().query(
    `insert into supresiones (email, motivo) values ($1, 'opt_out')`,
    [segundo.email],
  );

  const apSuprimido = await aprobar(segundo.correoId, ANA);
  afirmar(
    !apSuprimido.ok && apSuprimido.motivo === 'opt_out',
    'un correo que se suprimió DESPUÉS de entrar a la cola ya no se puede aprobar',
    JSON.stringify(apSuprimido),
  );
  afirmar(
    (apSuprimido as { detalle?: string }).detalle?.includes('no ser contactado') === true,
    'y explica el motivo al operador',
  );

  const colaTrasOptOut = await colaDeRevision(busquedaId);
  afirmar(
    !colaTrasOptOut.some((c) => c.correoId === segundo.correoId),
    'y también desaparece de la cola',
    `sigue en cola: ${colaTrasOptOut.length}`,
  );

  await poolPostgres().query(`delete from supresiones where email = $1`, [segundo.email]);

  // =========================================================================
  console.log('\n=== EDITAR Y DESCARTAR ===\n');

  const ed = await editar(segundo.correoId, { asunto: 'Asunto reescrito por Luis' }, LUIS);
  afirmar(ed.ok, 'Luis puede editar un borrador');
  const { rows: trasEd } = await poolPostgres().query<{ asunto: string; estado: string }>(
    `select asunto, estado from correos where id=$1`, [segundo.correoId],
  );
  afirmar(trasEd[0]!.asunto === 'Asunto reescrito por Luis', 'guardó el texto nuevo');
  afirmar(
    trasEd[0]!.estado === 'editado',
    'queda en "editado", NO en aprobado: editar no autoriza el envío',
    `estado=${trasEd[0]!.estado}`,
  );

  const edAprobado = await editar(primero.correoId, { asunto: 'x' }, LUIS);
  afirmar(
    !edAprobado.ok,
    'no se puede editar uno ya aprobado (habría que descartarlo y rehacerlo)',
    JSON.stringify(edAprobado),
  );

  await descartar(segundo.correoId, LUIS, 'no es nuestro perfil de cliente');
  const { rows: trasDesc } = await poolPostgres().query<{ correo: string; prosp: string }>(
    `select co.estado as correo, p.estado as prosp
     from correos co join prospecciones p on p.id = co.prospeccion_id
     where co.id = $1`,
    [segundo.correoId],
  );
  afirmar(trasDesc[0]!.correo === 'descartado', 'el correo queda descartado');
  afirmar(
    trasDesc[0]!.prosp === 'descartado_por_humano',
    'y la prospección también — pero sigue EN LA BASE (priorizar, no descartar)',
    `prospeccion=${trasDesc[0]!.prosp}`,
  );

  // =========================================================================
  console.log('\n=== SI CLAUDE RECHAZA ===\n');

  await poolPostgres().query(
    `update prospecciones set estado='priorizado' where busqueda_id=$1 and estado='correo_generado'`,
    [busquedaId],
  );
  let reventó = false;
  try {
    await generarBorradores(busquedaId, { generador: generadorQueRechaza() });
  } catch {
    reventó = true;
  }
  afirmar(reventó, 'un rechazo de Claude revienta en vez de guardar un borrador vacío');

  // =========================================================================
  console.log('\n=== ESTADO FINAL DE LA TUBERÍA ===\n');

  const { rows: est } = await poolPostgres().query<{ estado: string; n: string }>(
    `select estado, count(*)::text as n from prospecciones
     where busqueda_id=$1 group by estado order by estado`,
    [busquedaId],
  );
  for (const e of est) console.log(`        ${e.estado.padEnd(24)} ${e.n}`);
  afirmar(est.length > 0, 'la tubería tiene leads en varios estados');
  afirmar(
    est.reduce((s, e) => s + Number(e.n), 0) === 6,
    'ningún lead se perdió en el camino (6 prospecciones de punta a punta)',
    `total=${est.reduce((s, e) => s + Number(e.n), 0)}`,
  );

  console.log(`\n${'='.repeat(70)}`);
  if (fallos === 0) {
    console.log(`OK — ${pruebas} comprobaciones, 0 fallos.`);
    console.log('Pipeline completo de punta a punta. Nada se envió: falta el humano y B6.');
  } else {
    console.log(`${fallos} FALLO(S) de ${pruebas} comprobaciones.`);
    process.exitCode = 1;
  }
  console.log('='.repeat(70));
} finally {
  await limpiar();
  console.log('\n  (datos de prueba borrados)');
  await cerrarPostgres();
}
