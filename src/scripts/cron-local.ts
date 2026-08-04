/**
 * Corre el pipeline en bucle localmente, sin abrir ninguna pantalla.
 *
 *   npm run cron
 *
 * ===========================================================================
 * Ya NO es el mecanismo principal (2026-08-04)
 * ===========================================================================
 *
 * Desde que `/corridas/[id]` hace avanzar la corrida sola mientras está
 * abierta (ver `Avanzador.tsx`), esto es una herramienta manual: sirve para
 * hacer avanzar corridas SIN tener que abrir el navegador — por ejemplo, para
 * dejar varias encargadas y procesarlas de una sentada, o para un script.
 * Nada del uso normal de la herramienta depende de que esto esté corriendo.
 *
 * El intervalo es de 2 segundos, más rápido que cualquier uso real, para que
 * verlo en la terminal no sea una espera eterna.
 *
 * Se corta solo cuando no queda nada pendiente.
 */

import { tick, dependenciasAutomaticas } from '../servicios/pipelineService.ts';
import { cerrarPostgres } from '../core/postgres.ts';

const INTERVALO_MS = 2000;
/** Tope de seguridad: evita un bucle infinito si un paso no avanza nunca. */
const MAX_TICKS = 400;

const deps = await dependenciasAutomaticas();

console.log('\n=== cron local ===');
if (deps.usaFixtures) {
  console.log('⚠️  Corriendo con DATOS SINTÉTICOS: faltan credenciales.');
  console.log(`   Faltan: ${deps.faltantes.join(', ')}`);
  console.log('   Las corridas quedan marcadas con `con_fixtures` y el panel lo avisa.\n');
} else {
  console.log('Corriendo con las APIs reales.\n');
}

let ticks = 0;
let vacios = 0;

try {
  while (ticks < MAX_TICKS) {
    const r = await tick();
    ticks += 1;

    if (!r.hizoAlgo) {
      vacios += 1;
      // Dos vueltas sin nada que hacer: no hay trabajo pendiente.
      if (vacios >= 2) {
        console.log('Nada pendiente. Listo.');
        break;
      }
    } else {
      vacios = 0;
      if (r.error !== undefined) {
        console.log(`  ✗ FALLÓ: ${r.error}`);
      } else {
        const p = r.resultado!;
        const flecha = p.termino ? '✓' : '→';
        console.log(`  ${flecha} ${p.pasoEjecutado.padEnd(10)} ${p.detalle}`);
      }
    }

    await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }
  if (ticks >= MAX_TICKS) {
    console.log(`Se alcanzó el tope de ${MAX_TICKS} vueltas. Revisar si un paso quedó trabado.`);
  }
} finally {
  await cerrarPostgres();
}
