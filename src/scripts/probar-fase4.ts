/**
 * Prueba la Fase 4 (scoring) — motor puro + pipeline completo contra la base real.
 *
 *   npm run probar:fase4
 *
 * La parte más importante de esta prueba no es que el score salga "bien" (eso lo
 * define el jefe con los pesos). Es demostrar que **el motor es modular**:
 * agregar una regla, quitarla o cambiar un peso NO requiere tocar el motor.
 */

import { calcularScore } from '../servicios/scoring/motor.ts';
import { REGLAS } from '../servicios/scoring/reglas.ts';
import { pesosActuales, ALTO, MEDIO } from '../servicios/scoring/configuracion.ts';
import { extraerSenalesWeb, esSoloRedes, extraerContacto } from '../servicios/contactoService.ts';
import { priorizar, guardarSenalesWeb } from '../servicios/scoringService.ts';
import { buscar } from '../servicios/placesService.ts';
import {
  registrarBusqueda, guardarDescubrimiento, registrarContacto,
  pendientesDeContacto, marcarSinWeb,
} from '../servicios/negocioService.ts';
import { lectorDeFixture } from '../fixtures/places-restaurantes-panama.ts';
import { traerDeFixture } from '../fixtures/sitios-web-panama.ts';
import { poolPostgres, cerrarPostgres } from '../core/postgres.ts';
import { cumple, noCumple, type LeadParaScoring, type Regla } from '../dominio/scoring.ts';
import type { SearchSpec } from '../dominio/tipos.ts';

const MARCA = '[PRUEBA-F4] sitio web premium';
const ANIO = 2026; // inyectado: el motor y las reglas son deterministas

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

/** Lead base: todo indeterminado. Cada prueba enciende solo lo que necesita. */
function leadVacio(): LeadParaScoring {
  return {
    rating: null, num_resenas: null, sitio_web: null, dominio: null,
    categoria_google: null, sucursales: null, web_respondio: null,
    tiene_pixel_meta: null, tiene_tag_google: null, anio_copyright: null,
    es_responsive: null, solo_redes: null, tiene_redes: null,
    tiene_email: true, es_rol: null, antiguedad_dominio_anios: null,
    anio_actual: ANIO,
  };
}

async function limpiar(): Promise<void> {
  const p = poolPostgres();
  await p.query(`delete from negocios where place_id like 'FIXTURE_%'`);
  await p.query(`delete from busquedas where producto like '[PRUEBA-F4]%'`);
}

try {
  await limpiar();

  // =========================================================================
  console.log('\n=== MODULARIDAD: lo que pediste ===\n');

  const pesos = pesosActuales();

  // 1. Una regla NUEVA, definida acá mismo, sin tocar el motor ni reglas.ts.
  const reglaInventada: Regla = {
    id: 'categoria_es_restaurante',
    nombre: 'Es restaurante',
    eje: 'capacidad',
    tipo: 'puntua',
    evaluar: (l) =>
      l.categoria_google === 'restaurant'
        ? cumple(1, 'es restaurante')
        : noCumple(),
  };

  const lead = { ...leadVacio(), categoria_google: 'restaurant', num_resenas: 100 };

  const sinLaRegla = calcularScore(lead, { reglas: REGLAS, pesos });
  const conLaRegla = calcularScore(lead, {
    reglas: [...REGLAS, reglaInventada],
    pesos: { ...pesos, categoria_es_restaurante: ALTO },
  });

  afirmar(
    conLaRegla.score !== sinLaRegla.score,
    'agregar una regla cambia el score SIN tocar el motor',
    `sin=${sinLaRegla.score} con=${conLaRegla.score}`,
  );
  afirmar(
    conLaRegla.detalle.some((d) => d.id === 'categoria_es_restaurante'),
    'la regla nueva aparece en el desglose',
  );

  // 2. Peso 0 = señal apagada, sin borrar nada.
  const apagada = calcularScore(lead, {
    reglas: [...REGLAS, reglaInventada],
    pesos: { ...pesos, categoria_es_restaurante: 0 },
  });
  afirmar(
    apagada.score === sinLaRegla.score,
    'peso 0 apaga la señal (mismo score que si no existiera)',
    `apagada=${apagada.score} sin=${sinLaRegla.score}`,
  );

  // 3. Cambiar un peso cambia el resultado, sin tocar código.
  //
  // Hacen falta DOS señales evaluables en el mismo eje: si hay una sola, el eje
  // da 100 sin importar su peso (el peso está arriba y abajo de la división).
  // Mi primera versión de esta prueba tenía una sola y no probaba nada.
  const dosSenales = { ...leadVacio(), num_resenas: 200, sucursales: 1 };
  const conMedio = calcularScore(dosSenales, { reglas: REGLAS, pesos });
  const conAlto = calcularScore(dosSenales, {
    reglas: REGLAS,
    pesos: { ...pesos, resenas_activas: MEDIO * 6 },
  });
  afirmar(
    conAlto.porEje.capacidad !== conMedio.porEje.capacidad,
    'subir el peso de una señal cambia el eje (solo se editó configuración)',
    `medio=${conMedio.porEje.capacidad?.toFixed(1)} alto=${conAlto.porEje.capacidad?.toFixed(1)}`,
  );

  // 4. El motor no menciona ninguna señal: se comprueba leyendo el archivo.
  const { readFile } = await import('node:fs/promises');
  const motorSrc = await readFile('src/servicios/scoring/motor.ts', 'utf8');
  const nombresDeSenales = ['resenas', 'pixel', 'sucursal', 'copyright', 'responsive', 'publicidad'];
  const filtrados = nombresDeSenales.filter((n) => motorSrc.toLowerCase().includes(n));
  afirmar(
    filtrados.length === 0,
    'el archivo del motor NO menciona ninguna señal por nombre',
    `encontrado: ${filtrados.join(', ')}`,
  );

  // =========================================================================
  console.log('\n=== "NO SÉ" ≠ "NO CUMPLE" ===\n');

  // Solo un dato conocido: el score se calcula sobre lo evaluable, no sobre todo.
  const soloResenas = calcularScore({ ...leadVacio(), num_resenas: 200 }, { reglas: REGLAS, pesos });
  afirmar(
    soloResenas.porEje.capacidad === 100,
    'con 1 sola señal evaluable al máximo, el eje da 100 (las indeterminadas salen del divisor)',
    `capacidad=${soloResenas.porEje.capacidad}`,
  );
  const indets = soloResenas.detalle.filter((d) => d.indeterminado).length;
  afirmar(indets > 0, `${indets} reglas quedaron indeterminadas y no castigaron el score`);

  // "Eje sin datos = null" se prueba con un set de reglas mínimo.
  //
  // No se puede probar con REGLAS completas: `sin_sitio_web` SIEMPRE es
  // evaluable (un `sitio_web` null no es "no sé", es "no tiene"), así que el eje
  // de necesidad nunca queda vacío. Mi primera versión asumía que sí y falló.
  const reglaQueNuncaSabe: Regla = {
    id: 'nunca_sabe',
    nombre: 'Señal sin datos',
    eje: 'necesidad',
    tipo: 'puntua',
    evaluar: () => ({ indeterminado: true, fuerza: 0, razon: null }),
  };
  const ejeVacio = calcularScore(leadVacio(), {
    reglas: [reglaQueNuncaSabe],
    pesos: { nunca_sabe: MEDIO },
  });
  afirmar(
    ejeVacio.porEje.necesidad === null,
    'un eje donde TODAS las reglas son indeterminadas da null, NO 0 ("no se sabe" ≠ "malo")',
    `necesidad=${ejeVacio.porEje.necesidad}`,
  );

  // =========================================================================
  console.log('\n=== MEDIA GEOMÉTRICA vs SUMA: por qué importa ===\n');

  // Puede pagar mucho, no necesita nada.
  const ricoSinNecesidad: LeadParaScoring = {
    ...leadVacio(),
    num_resenas: 300, sucursales: 6, tiene_pixel_meta: true, tiene_tag_google: true,
    tiene_redes: true, sitio_web: 'https://x.com', dominio: 'x.com',
    web_respondio: true, es_responsive: true, anio_copyright: ANIO, solo_redes: false,
  };
  const geo = calcularScore(ricoSinNecesidad, { reglas: REGLAS, pesos, estrategia: 'geometrica' });
  const sum = calcularScore(ricoSinNecesidad, { reglas: REGLAS, pesos, estrategia: 'suma' });

  console.log(`        capacidad=${geo.porEje.capacidad?.toFixed(0)} necesidad=${geo.porEje.necesidad?.toFixed(0)}`);
  console.log(`        geométrica=${geo.score}  ·  suma=${sum.score}`);
  afirmar(
    (geo.score ?? 0) < (sum.score ?? 0),
    'negocio con plata y sitio impecable: la geométrica lo castiga, la suma lo premia',
    `geo=${geo.score} suma=${sum.score}`,
  );

  // Equilibrado: debe ganarle al desbalanceado.
  const equilibrado: LeadParaScoring = {
    ...leadVacio(),
    num_resenas: 110, sucursales: 4, tiene_pixel_meta: true, tiene_redes: true,
    sitio_web: 'https://y.com', dominio: 'y.com', web_respondio: true,
    es_responsive: false, anio_copyright: 2018, solo_redes: false,
  };
  const eq = calcularScore(equilibrado, { reglas: REGLAS, pesos });
  afirmar(
    (eq.score ?? 0) > (geo.score ?? 0),
    'el equilibrado (puede pagar Y necesita) le gana al que solo puede pagar',
    `equilibrado=${eq.score} soloRico=${geo.score}`,
  );

  // =========================================================================
  console.log('\n=== EL FILTRO ELIMINATORIO ===\n');

  const sinContacto = calcularScore(
    { ...ricoSinNecesidad, tiene_email: false },
    { reglas: REGLAS, pesos },
  );
  afirmar(sinContacto.score === null, 'sin contacto: score null, NO 0 (es "no aplica")');
  afirmar(
    sinContacto.filtradoPor === 'contacto_accesible',
    'dice QUÉ filtro lo dejó fuera',
    `filtradoPor=${sinContacto.filtradoPor}`,
  );

  // =========================================================================
  console.log('\n=== SEÑALES DEL HTML (mismo HTML de la Fase 2) ===\n');

  const traer = traerDeFixture();
  const cFogon = await extraerContacto('https://elfogonpanameno.com.pa', 'elfogonpanameno.com.pa', {
    traer, anioActual: ANIO,
  });
  const s = cFogon.senalesWeb!;
  afirmar(s.tiene_pixel_meta, 'detecta el pixel de Meta (reemplazo de Meta Ad Library)');
  afirmar(s.tiene_tag_google, 'detecta el tag de Google Ads');
  afirmar(s.anio_copyright === 2018, 'lee el año del copyright', `anio=${s.anio_copyright}`);
  afirmar(!s.es_responsive, 'detecta que NO es responsive (señal de necesidad)');

  const cTerraza = await extraerContacto('https://laterraza.com.pa', 'laterraza.com.pa', {
    traer, anioActual: ANIO,
  });
  afirmar(cTerraza.senalesWeb!.es_responsive, 'el sitio moderno sí sale responsive');
  afirmar(
    cTerraza.senalesWeb!.anio_copyright === 2026,
    'y con copyright al día',
    `anio=${cTerraza.senalesWeb!.anio_copyright}`,
  );

  afirmar(esSoloRedes('instagram.com'), 'un "sitio" que es instagram.com se marca solo_redes');
  afirmar(esSoloRedes('linktr.ee'), 'y linktr.ee también');
  afirmar(!esSoloRedes('elfogonpanameno.com.pa'), 'un dominio propio no es solo_redes');

  // El año más alto gana: un footer viejo con un script nuevo = sitio vivo.
  const mezcla = extraerSenalesWeb('<p>&copy; 2015</p><script>/* build 2025 */</script>© 2025', ANIO);
  afirmar(mezcla.anio_copyright === 2025, 'con varios años, toma el más alto (no marca vivo como abandonado)', `anio=${mezcla.anio_copyright}`);

  // =========================================================================
  console.log('\n=== PIPELINE COMPLETO: 1 → 2 → 4 ===\n');

  const spec: SearchSpec = {
    producto: MARCA, categoria: 'restaurantes',
    ubicacion: 'Ciudad de Panamá', canal: 'google_maps',
  };
  const busquedaId = await registrarBusqueda(spec, 'lista_jefe');
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

  const pri = await priorizar(busquedaId, { anioActual: ANIO });

  console.log(`        evaluados=${pri.evaluados} conScore=${pri.conScore} filtrados=${pri.filtrados} promedio=${pri.scorePromedio}\n`);
  for (const t of pri.top) {
    console.log(`        ${String(t.score).padStart(3)}  ${t.nombre}`);
    console.log(`             ${t.razon}`);
  }

  afirmar(pri.conScore > 0, 'puntuó al menos un lead');
  afirmar(
    pri.top[0]?.nombre.includes('Fogón') === true,
    'EL FOGÓN QUEDA PRIMERO: invierte en publicidad + 412 reseñas, pero su sitio es de 2018 y no es responsive',
    `primero=${pri.top[0]?.nombre}`,
  );
  const terraza = pri.top.find((t) => t.nombre.includes('Terraza'));
  afirmar(
    terraza !== undefined && (terraza.score ?? 0) < (pri.top[0]?.score ?? 0),
    'La Terraza queda por debajo: tiene plata pero su web está bien, no necesita',
    `terraza=${terraza?.score} fogon=${pri.top[0]?.score}`,
  );

  // Recalcular con la estrategia del jefe sin el eje de necesidad: debe cambiar
  // el orden. Es la evidencia de que el eje que faltaba importa.
  const soloCap = await priorizar(busquedaId, { anioActual: ANIO, estrategia: 'solo_capacidad' });
  console.log(`\n        con "solo_capacidad" (la lista original, sin el eje de necesidad):`);
  for (const t of soloCap.top.slice(0, 3)) {
    console.log(`        ${String(t.score).padStart(3)}  ${t.nombre}`);
  }
  // Lo que cambia no es tanto el ORDEN como la DISTANCIA. Sin el eje de
  // necesidad, La Terraza se ve casi tan buena como el Fogón — y ese es
  // justamente el error que el eje evita.
  const brechaCon = (pri.top[0]?.score ?? 0) - (pri.top[1]?.score ?? 0);
  const brechaSin = (soloCap.top[0]?.score ?? 0) - (soloCap.top[1]?.score ?? 0);
  console.log(`        brecha 1º-2º:  con necesidad=${brechaCon}  ·  sin necesidad=${brechaSin}`);
  afirmar(
    brechaCon > brechaSin,
    'con el eje de necesidad el 1º se separa del 2º; sin él se ven casi iguales',
    `con=${brechaCon} sin=${brechaSin}`,
  );

  // El desglose queda guardado para que el panel lo muestre.
  const { rows: det } = await poolPostgres().query<{ n: string }>(
    `select count(*)::text as n from prospecciones
     where busqueda_id = $1 and score_detalle is not null`,
    [busquedaId],
  );
  afirmar(
    Number(det[0]!.n) === pri.evaluados,
    'todos guardaron score_detalle (transparencia: se puede explicar cada score)',
    `con detalle=${det[0]!.n} de ${pri.evaluados}`,
  );

  const { rows: est } = await poolPostgres().query<{ estado: string; n: string }>(
    `select estado, count(*)::text as n from prospecciones
     where busqueda_id = $1 group by estado order by estado`,
    [busquedaId],
  );
  console.log(`\n        estados: ${est.map((e) => `${e.estado}=${e.n}`).join(' · ')}`);
  afirmar(
    est.some((e) => e.estado === 'priorizado'),
    'las prospecciones avanzaron a "priorizado"',
  );
  afirmar(
    est.some((e) => e.estado === 'sin_contacto'),
    'y las que no tienen contacto siguen ahí (priorizar, NO descartar)',
  );

  console.log(`\n${'='.repeat(70)}`);
  if (fallos === 0) {
    console.log(`OK — ${pruebas} comprobaciones, 0 fallos.`);
    console.log('Fase 4 modular: agregar/quitar/repesar señales sin tocar el motor.');
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
