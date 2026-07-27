/**
 * Prueba la Fase 2 (extracción de contacto) contra la base REAL, con HTML de
 * fixture — sin salir a internet.
 *
 *   npm run probar:fase2
 *
 * Necesita `DATABASE_URL`. NO necesita Apify ni Google: el lector de páginas se
 * inyecta desde `src/fixtures/sitios-web-panama.ts`.
 *
 * Limpia lo que crea al terminar.
 */

import { extraerContacto, desofuscar, puntuarEmail } from '../servicios/contactoService.ts';
import {
  registrarBusqueda,
  guardarDescubrimiento,
  registrarContacto,
  pendientesDeContacto,
  marcarSinWeb,
} from '../servicios/negocioService.ts';
import { buscar } from '../servicios/placesService.ts';
import { traerDeFixture } from '../fixtures/sitios-web-panama.ts';
import { lectorDeFixture } from '../fixtures/places-restaurantes-panama.ts';
import { poolPostgres, cerrarPostgres } from '../core/postgres.ts';
import type { SearchSpec } from '../dominio/tipos.ts';

const MARCA = '[PRUEBA-F2] sitio web premium';
const traer = traerDeFixture();

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
  await p.query(`delete from busquedas where producto like '[PRUEBA-F2]%'`);
}

try {
  await limpiar();

  console.log('\n=== EXTRACCIÓN: los 6 patrones de sitio ===\n');

  // 1. Email en footer, texto plano, con basura alrededor.
  const c1 = await extraerContacto('https://elfogonpanameno.com.pa', 'elfogonpanameno.com.pa', { traer });
  afirmar(c1.email === 'info@elfogonpanameno.com.pa', 'footer: encuentra info@ del propio dominio', `obtuvo: ${c1.email}`);
  afirmar(c1.origen === 'footer', 'footer: origen correcto', `origen=${c1.origen}`);
  afirmar(
    !c1.candidatos.some((e) => e.includes('sentry')),
    'footer: filtra el DSN de Sentry como basura',
    `candidatos: ${c1.candidatos.join(', ')}`,
  );
  afirmar(!c1.ofuscado, 'footer: no marca ofuscado (venía en texto plano)');

  // 2. Home sin email; está en /contacto como mailto.
  const c2 = await extraerContacto('https://laterraza.com.pa', 'laterraza.com.pa', { traer });
  afirmar(c2.email !== null, 'multi-ruta: encuentra el email en /contacto', `obtuvo: ${c2.email}`);
  afirmar(c2.origen === 'mailto', 'multi-ruta: detecta que era un mailto:', `origen=${c2.origen}`);
  afirmar(
    (c2.urlUsada ?? '').includes('/contacto'),
    'multi-ruta: reporta que la respuesta vino de /contacto',
    `url=${c2.urlUsada}`,
  );
  afirmar(
    c2.redes !== null && c2.redes['instagram'] !== undefined,
    'multi-ruta: rescata el Instagram del home aunque el email estuviera en otra página',
    JSON.stringify(c2.redes),
  );

  // 3. Email ofuscado: sin desofuscar se pierde el lead completo.
  const c3 = await extraerContacto('http://sushikobe.pa', 'sushikobe.pa', { traer });
  afirmar(c3.email === 'ventas@sushikobe.pa', 'ofuscado: "(arroba)" se resuelve', `obtuvo: ${c3.email}`);
  afirmar(c3.ofuscado, 'ofuscado: queda marcado como tal (señal para Ley 81)');

  // 4. Solo formulario: no hay email que sacar.
  const c4 = await extraerContacto('https://donnico.com.pa', 'donnico.com.pa', { traer });
  afirmar(c4.email === null, 'solo formulario: no inventa un email', `obtuvo: ${c4.email}`);
  afirmar(c4.sitioRespondio, 'solo formulario: distingue "respondió sin email" de "sitio caído"');

  // 5. Gmail vs corporativo: debe preferir el corporativo.
  const c5 = await extraerContacto('https://marisqueriachela.com', 'marisqueriachela.com', { traer });
  afirmar(
    c5.email === 'administracion@marisqueriachela.com',
    'prioridad: prefiere el corporativo sobre el gmail',
    `obtuvo: ${c5.email} · candidatos: ${c5.candidatos.join(', ')}`,
  );
  afirmar(c5.candidatos.length === 2, 'prioridad: guarda los 2 candidatos para revisión manual');

  // 6. Sitio caído.
  const c6 = await extraerContacto('https://sitiocaido.com.pa', 'sitiocaido.com.pa', { traer });
  afirmar(c6.email === null && !c6.sitioRespondio, 'sitio caído: no revienta, marca que no respondió');

  console.log('\n=== FUNCIONES PURAS ===\n');
  afirmar(
    desofuscar('ventas (arroba) x.pa') === 'ventas@x.pa',
    'desofuscar: (arroba)',
    desofuscar('ventas (arroba) x.pa'),
  );
  afirmar(desofuscar('a [at] b.com') === 'a@b.com', 'desofuscar: [at]', desofuscar('a [at] b.com'));
  afirmar(
    desofuscar('a (arroba) b (punto) com') === 'a@b.com',
    'desofuscar: (punto)',
    desofuscar('a (arroba) b (punto) com'),
  );
  afirmar(
    puntuarEmail('info@mio.com', 'mio.com') > puntuarEmail('info@gmail.com', 'mio.com'),
    'puntuar: dominio propio gana a gmail',
  );
  afirmar(
    puntuarEmail('info@mio.com', 'mio.com') > puntuarEmail('juan.perez@mio.com', 'mio.com'),
    'puntuar: info@ gana a un buzón personal del mismo dominio',
  );

  console.log('\n=== PERSISTENCIA + ESTADOS ===\n');

  const spec: SearchSpec = {
    producto: MARCA,
    categoria: 'restaurantes',
    ubicacion: 'Ciudad de Panamá',
    canal: 'google_maps',
  };
  const busquedaId = await registrarBusqueda(spec, 'lista_jefe');
  const { negocios } = await buscar(spec, { limite: 60, lector: lectorDeFixture() });
  await guardarDescubrimiento(busquedaId, negocios);

  const pendientes = await pendientesDeContacto(busquedaId);
  console.log(`  (${pendientes.length} negocios con web entran a la Fase 2)\n`);

  let conEmail = 0;
  let sinEmail = 0;
  for (const p of pendientes) {
    const c = await extraerContacto(p.sitioWeb, p.dominio, { traer });
    const { estadoNuevo } = await registrarContacto(p.negocioId, p.prospeccionId, {
      email: c.email,
      redes: c.redes,
      origen: c.origen,
      ofuscado: c.ofuscado,
    });
    if (estadoNuevo === 'contacto_encontrado') conEmail += 1;
    else sinEmail += 1;
    console.log(`        ${p.nombre.padEnd(38)} ${c.email ?? '(sin email)'} → ${estadoNuevo}`);
  }

  console.log('');
  afirmar(conEmail === 4, '4 negocios con email encontrado', `conEmail=${conEmail}`);
  afirmar(
    sinEmail === 1,
    '1 sin contacto: el sitio respondió pero solo tenía formulario',
    `sinEmail=${sinEmail}`,
  );

  // El hueco que destapó esta prueba: el negocio SIN WEB nunca entra a la
  // Fase 2, así que nada lo marcaba y quedaba varado en `negocio_encontrado`.
  const { rows: varadosAntes } = await poolPostgres().query<{ n: string }>(
    `select count(*)::text as n from prospecciones
     where busqueda_id = $1 and estado = 'negocio_encontrado'`,
    [busquedaId],
  );
  afirmar(
    varadosAntes[0]!.n === '1',
    'antes de cerrar: 1 prospección varada (el negocio sin web)',
    `varados=${varadosAntes[0]!.n}`,
  );

  const rescatados = await marcarSinWeb(busquedaId);
  afirmar(rescatados === 1, 'marcarSinWeb() rescata al varado', `rescatados=${rescatados}`);

  const { rows: estados } = await poolPostgres().query<{ estado: string; n: string }>(
    `select p.estado, count(*)::text as n from prospecciones p
     where p.busqueda_id = $1 group by p.estado order by p.estado`,
    [busquedaId],
  );
  console.log(`        estados en la base: ${estados.map((e) => `${e.estado}=${e.n}`).join(' · ')}`);
  afirmar(
    estados.some((e) => e.estado === 'contacto_encontrado' && e.n === '4'),
    'la base refleja 4 en contacto_encontrado',
  );
  afirmar(
    estados.some((e) => e.estado === 'sin_contacto' && e.n === '2'),
    'la base refleja 2 en sin_contacto: el del formulario + el sin web (NINGUNO se borró)',
  );
  afirmar(
    !estados.some((e) => e.estado === 'negocio_encontrado'),
    'no queda ninguna prospección varada: la Fase 2 resuelve todas',
  );

  // El caso que motivó el fix (b): dos negocios distintos, un solo buzón.
  const { rows: buzonCompartido } = await poolPostgres().query<{ email: string; negocios: string }>(
    `select lower(c.email) as email, count(distinct c.negocio_id)::text as negocios
     from contactos c join negocios n on n.id = c.negocio_id
     where n.place_id like 'FIXTURE_%' and c.email is not null
     group by lower(c.email) having count(distinct c.negocio_id) > 1`,
  );
  afirmar(
    buzonCompartido.length === 1 && buzonCompartido[0]!.negocios === '2',
    '(b) las 2 sucursales comparten un solo buzón → por eso el correo cuelga del CONTACTO',
    `compartidos: ${JSON.stringify(buzonCompartido)}`,
  );
  console.log(
    `        ${buzonCompartido[0]?.email} lo comparten ${buzonCompartido[0]?.negocios} negocios.\n` +
      '        En la Fase 5 eso serían 2 borradores al mismo buzón: los detecta v_buzones_saturados.',
  );

  const { rows: ofuscados } = await poolPostgres().query<{ n: string }>(
    `select count(*)::text as n from contactos c
     join negocios n on n.id = c.negocio_id
     where n.place_id like 'FIXTURE_%' and c.email_ofuscado`,
  );
  afirmar(ofuscados[0]!.n === '1', 'se persistió 1 email marcado como ofuscado', `n=${ofuscados[0]!.n}`);

  // No retroceder: re-correr la Fase 2 no debe devolver un lead avanzado.
  const primera = pendientes[0]!;
  await poolPostgres().query(`update prospecciones set estado='aprobado' where id=$1`, [
    primera.prospeccionId,
  ]);
  await registrarContacto(primera.negocioId, primera.prospeccionId, {
    email: 'otro@ejemplo.com.pa',
    origen: 'footer',
  });
  const { rows: tras } = await poolPostgres().query<{ estado: string }>(
    `select estado from prospecciones where id=$1`,
    [primera.prospeccionId],
  );
  afirmar(
    tras[0]!.estado === 'aprobado',
    'no retrocede: una prospección en "aprobado" no vuelve a "contacto_encontrado"',
    `quedó en ${tras[0]!.estado}`,
  );

  // Idempotencia de la extracción completa.
  const antes = (await poolPostgres().query<{ n: string }>(
    `select count(*)::text as n from contactos c join negocios n on n.id=c.negocio_id
     where n.place_id like 'FIXTURE_%'`,
  )).rows[0]!.n;
  for (const p of pendientes) {
    const c = await extraerContacto(p.sitioWeb, p.dominio, { traer });
    await registrarContacto(p.negocioId, p.prospeccionId, {
      email: c.email, redes: c.redes, origen: c.origen, ofuscado: c.ofuscado,
    });
  }
  const despues = (await poolPostgres().query<{ n: string }>(
    `select count(*)::text as n from contactos c join negocios n on n.id=c.negocio_id
     where n.place_id like 'FIXTURE_%'`,
  )).rows[0]!.n;
  afirmar(antes === despues, 'idempotente: re-correr no duplica contactos', `${antes} -> ${despues}`);

  console.log(`\n${'='.repeat(64)}`);
  if (fallos === 0) {
    console.log(`OK — ${pruebas} comprobaciones, 0 fallos.`);
    console.log('Fase 2 funciona: extrae, prioriza, desofusca, persiste y no retrocede.');
    console.log('Falta cambiar el fixture de HTML por Apify.');
  } else {
    console.log(`${fallos} FALLO(S) de ${pruebas} comprobaciones.`);
    process.exitCode = 1;
  }
  console.log('='.repeat(64));
} finally {
  await limpiar();
  console.log('\n  (datos de prueba borrados)');
  await cerrarPostgres();
}
