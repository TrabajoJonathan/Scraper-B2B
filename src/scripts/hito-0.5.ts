/**
 * HITO 0.5 — la rebanada fina de punta a punta.
 *
 * Un producto, un canal, pocos negocios, hasta que salga UN borrador de correo
 * en pantalla. Feo y desechable a proposito: el objetivo es ver el flujo
 * completo funcionando y aprender los campos reales de Places ANTES de
 * congelar el esquema.
 *
 * No toca Supabase. No envia nada. Solo imprime.
 *
 *   npm run hito05
 *
 * Necesita en .env:  GOOGLE_PLACES_API_KEY  y  ANTHROPIC_API_KEY
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { buscar } from '../servicios/placesService.ts';
import { extraerContacto } from '../servicios/contactoService.ts';
import { redactar, elegirPersonalizador } from '../servicios/redaccionService.ts';
import { estadoCredenciales } from '../core/config.ts';
import { FIELD_MASK } from '../core/places.ts';
import type { SearchSpec } from '../dominio/tipos.ts';

// ---------------------------------------------------------------------------
// El searchSpec. En el Modo 1 real esto viene de la lista del jefe.
// PENDIENTE (decision #1): todavia no tenemos la lista, asi que va un ejemplo
// coherente con la Linea 3 del pitch (agencia web premium -> quien compra web
// premium: restaurantes de alto nivel, hoteles boutique, inmobiliarias).
// ---------------------------------------------------------------------------
const SPEC: SearchSpec = {
  producto: 'sitio web premium con animaciones 3D',
  categoria: 'restaurantes',
  ubicacion: 'Ciudad de Panama',
  canal: 'google_maps',
};

const CUANTOS = 5;

function titulo(texto: string): void {
  console.log(`\n${'='.repeat(72)}\n${texto}\n${'='.repeat(72)}`);
}

function faltantes(): string[] {
  const cred = estadoCredenciales();
  const falta: string[] = [];
  if (!cred['GOOGLE_PLACES_API_KEY']) falta.push('GOOGLE_PLACES_API_KEY');
  if (!cred['ANTHROPIC_API_KEY']) falta.push('ANTHROPIC_API_KEY');
  return falta;
}

const falta = faltantes();
if (falta.length > 0) {
  console.error(
    `\nFaltan credenciales: ${falta.join(', ')}\n\n` +
      '  1. cp .env.example .env\n' +
      '  2. Llenar esas claves (el .env.example dice de donde sacar cada una)\n' +
      '  3. npm run hito05\n',
  );
  process.exit(1);
}

titulo('HITO 0.5 — rebanada fina');
console.log(`Producto:  ${SPEC.producto}`);
console.log(`Buscando:  ${SPEC.categoria} en ${SPEC.ubicacion}`);
console.log(`Canal:     ${SPEC.canal}`);

// ---------------------------------------------------------------------------
// PASO 1 — Descubrir (Places API)
// ---------------------------------------------------------------------------
titulo('PASO 1 · Descubrir negocios (Google Places API)');

const { negocios, llamadas, huboMas } = await buscar(SPEC, { limite: CUANTOS });

console.log(`Llamadas a Places: ${llamadas} · negocios: ${negocios.length}`);
if (huboMas) {
  console.log('Google todavia ofrecia mas resultados (hay nextPageToken).');
}
console.log('');

for (const [i, n] of negocios.entries()) {
  console.log(`${i + 1}. ${n.nombre}`);
  console.log(`   normalizado : ${n.nombre_normalizado}`);
  console.log(`   categoria   : ${n.categoria_google ?? '—'}`);
  console.log(`   web         : ${n.sitio_web ?? '—'}  (dominio: ${n.dominio ?? '—'})`);
  console.log(`   telefono    : ${n.telefono ?? '—'}`);
  console.log(`   rating      : ${n.rating ?? '—'} (${n.num_resenas ?? 0} resenas)`);
  console.log(`   estado      : ${n.estado_negocio ?? '—'}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// SPIKE — cobertura real de campos.
// Esto es lo que el roadmap pedia ver ANTES de congelar el DDL: no que campos
// documenta Google, sino cuantos vienen llenos en negocio panameno real.
// ---------------------------------------------------------------------------
titulo('SPIKE · cobertura real de campos de Places');

const CAMPOS = [
  'place_id',
  'sitio_web',
  'dominio',
  'telefono',
  'direccion',
  'categoria_google',
  'rating',
  'num_resenas',
  'estado_negocio',
] as const;

for (const campo of CAMPOS) {
  const llenos = negocios.filter((n) => n[campo] !== null && n[campo] !== undefined).length;
  const barra = '#'.repeat(llenos) + '.'.repeat(negocios.length - llenos);
  console.log(`  ${campo.padEnd(18)} ${barra}  ${llenos}/${negocios.length}`);
}
console.log(`\n  Field mask usado:\n  ${FIELD_MASK.split(',').join('\n  ')}`);

await mkdir('salidas', { recursive: true });
const rutaCrudo = `salidas/spike-places-${SPEC.categoria.replace(/\s+/g, '-')}.json`;
await writeFile(rutaCrudo, JSON.stringify(negocios, null, 2), 'utf8');
console.log(`\n  Volcado normalizado -> ${rutaCrudo}`);
console.log('  (revisalo a mano antes de dar por bueno el DDL)');

// ---------------------------------------------------------------------------
// PASO 2 — Contacto (provisional: fetch + regex. En Fase 2 lo hace Apify)
// ---------------------------------------------------------------------------
titulo('PASO 2 · Extraer contacto del sitio del negocio');
console.log('(provisional: fetch + regex. En la Fase 2 esto lo hace Apify)\n');

let elegido: (typeof negocios)[number] | undefined;
let emailElegido: string | null = null;
let origenElegido: string | null = null;
let sinContacto = 0;

for (const n of negocios) {
  if (n.sitio_web === null) {
    console.log(`— ${n.nombre}: sin web en Maps -> sin_contacto`);
    sinContacto += 1;
    continue;
  }
  const c = await extraerContacto(n.sitio_web, n.dominio);
  if (c.email !== null) {
    console.log(`OK ${n.nombre}: ${c.email}  (origen: ${c.origen}, en ${c.urlUsada})`);
    if (c.candidatos.length > 1) {
      console.log(`   otros candidatos: ${c.candidatos.filter((e) => e !== c.email).join(', ')}`);
    }
    if (elegido === undefined) {
      elegido = n;
      emailElegido = c.email;
      origenElegido = c.origen;
    }
  } else {
    console.log(`— ${n.nombre}: web responde pero sin email visible`);
    sinContacto += 1;
  }
}

console.log(`\nResumen: ${negocios.length - sinContacto} con email, ${sinContacto} sin contacto.`);
console.log('Recordatorio de diseno: los "sin contacto" NO se borran. Se marcan y quedan.');

if (elegido === undefined) {
  console.log(
    '\nNinguno de los 5 dio email. No es un fallo del codigo: pasa seguido con\n' +
      'negocio local. Opciones: subir CUANTOS, cambiar de categoria, o esperar\n' +
      'Apify (que sabe entrar mejor a sitios con JS).',
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// PASO 3 — Redactar (Claude Haiku 4.5)
// ---------------------------------------------------------------------------
titulo('PASO 3 · Redactar el borrador (Claude Haiku 4.5)');

console.log(`Negocio elegido : ${elegido.nombre}`);
console.log(`Email           : ${emailElegido} (origen: ${origenElegido})`);
console.log(`Personalizador  : ${elegirPersonalizador(elegido) ?? '(ninguno)'}\n`);

const { borrador, modelo, costoUSD: costo } = await redactar({
  negocio: elegido,
  producto: SPEC.producto,
});

console.log('-'.repeat(72));
console.log(`Para:    ${emailElegido}`);
console.log(`Asunto:  ${borrador.asunto}`);
console.log('-'.repeat(72));
console.log(borrador.cuerpo);
console.log('-'.repeat(72));
console.log(`CTA:     ${borrador.cta}`);
console.log(`Dato:    ${borrador.dato_personalizador_usado}`);
console.log('-'.repeat(72));
console.log(`\nModelo: ${modelo} · costo de este correo: $${costo.toFixed(5)} USD`);
console.log(`A 1.000 correos/mes: ~$${(costo * 1000).toFixed(2)} USD/mes`);

// ---------------------------------------------------------------------------
titulo('LISTO — la rebanada camina');
console.log('Places -> contacto -> borrador. Nada se envio y nada se guardo.');
console.log('El paso 7 (revision humana) es donde un humano aprueba. Fase 6.');
console.log('\nSiguiente: aplicar las migraciones y persistir esto (Fase 0/1).');
