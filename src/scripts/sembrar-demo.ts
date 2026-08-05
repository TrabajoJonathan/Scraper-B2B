/**
 * Llena la base con una corrida de DEMO usando los fixtures, para poder ver el
 * panel con datos sin tener ninguna credencial externa.
 *
 *   npm run sembrar          # crea la corrida de demo
 *   npm run sembrar -- borrar # la elimina
 *
 * Todo lo que crea lleva la marca `[DEMO]` en el producto, así que se puede
 * borrar sin tocar datos reales.
 *
 * ⚠️ Los datos son SINTÉTICOS: negocios inventados con perfiles de señales
 * elegidos a mano. Sirven para ver la interfaz funcionando y para mostrarla;
 * NO sirven para sacar conclusiones sobre el mercado panameño.
 */

import { crearCorrida, actualizarProgreso, terminarCorrida } from '../servicios/corridaService.ts';
import { buscar } from '../servicios/placesService.ts';
import { extraerContacto } from '../servicios/contactoService.ts';
import {
  guardarDescubrimiento, registrarContacto, pendientesDeContacto, marcarSinWeb,
} from '../servicios/negocioService.ts';
import { verificarPendientes } from '../servicios/verificarService.ts';
import { priorizar, guardarSenalesWeb } from '../servicios/scoringService.ts';
import { generarBorradores } from '../servicios/redaccionService.ts';
import { lectorDeFixture } from '../fixtures/places-restaurantes-panama.ts';
import { traerDeFixture } from '../fixtures/sitios-web-panama.ts';
import { verificadorDeFixture } from '../fixtures/verificaciones.ts';
import { generadorDeFixture } from '../fixtures/borradores.ts';
import { poolPostgres, cerrarPostgres } from '../core/postgres.ts';
import type { SearchSpec } from '../dominio/tipos.ts';

const MARCA = '[DEMO]';
const ANIO = 2026;

async function borrar(): Promise<void> {
  const p = poolPostgres();
  await p.query(`delete from negocios where place_id like 'FIXTURE_%'`);
  await p.query(`delete from busquedas where producto like '${MARCA}%'`);
  console.log('Datos de demo eliminados.');
}

try {
  if (process.argv.includes('borrar')) {
    await borrar();
  } else {
    await borrar(); // idempotente: si ya había demo, se reemplaza

    const spec: SearchSpec = {
      producto: `${MARCA} sitio web premium con animaciones 3D`,
      categoria: 'restaurantes',
      ubicacion: 'Bella Vista, Ciudad de Panamá',
      canal: 'google_maps',
    };

    // Se simula el recorrido del cron: cada paso actualiza el progreso, para que
    // la pantalla de la corrida se vea como se va a ver de verdad.
    const { corridaId, busquedaId } = await crearCorrida(spec, 'ana@code-flow-ai.com');
    console.log(`corrida creada: ${corridaId}`);

    /*
     * Marcarla como sintética A MANO, y de entrada.
     *
     * Este script no pasa por `tick()` —llama a los servicios uno por uno para
     * simular el recorrido del cron— así que se saltea el único lugar que
     * escribe `con_fixtures`. Resultado: la corrida MÁS falsa de la base era la
     * única sin el aviso, y es justo la que se usa para mostrar el sistema.
     *
     * Se pone antes de sembrar nada y no al final: si el script se corta a la
     * mitad, lo que quede tiene que estar marcado igual.
     */
    await poolPostgres().query(
      `update corridas set con_fixtures = true, fixtures_en = $2 where id = $1`,
      [corridaId, ['los negocios y sus sitios web', 'la verificación de entregabilidad', 'la redacción de los correos']],
    );

    const traer = traerDeFixture();
    const { negocios } = await buscar(spec, { limite: 60, lector: lectorDeFixture() });
    await guardarDescubrimiento(busquedaId, negocios);
    await actualizarProgreso(corridaId, {
      paso: 'contacto', hecho: negocios.length, total: negocios.length,
    });
    console.log(`  descubrir  → ${negocios.length} negocios`);

    let n = 0;
    for (const p of await pendientesDeContacto(busquedaId)) {
      const c = await extraerContacto(p.sitioWeb, p.dominio, { traer, anioActual: ANIO });
      await registrarContacto(p.negocioId, p.prospeccionId, {
        email: c.email, redes: c.redes, origen: c.origen, ofuscado: c.ofuscado,
      });
      await guardarSenalesWeb(p.negocioId, c.sitioRespondio, c.senalesWeb, c.soloRedes);
      await actualizarProgreso(corridaId, { hecho: ++n });
    }
    await marcarSinWeb(busquedaId);
    console.log(`  contacto   → ${n} sitios revisados`);

    await actualizarProgreso(corridaId, { paso: 'priorizar' });
    const pr = await priorizar(busquedaId, { anioActual: ANIO });
    console.log(`  priorizar  → ${pr.conScore} con score, promedio ${pr.scorePromedio}`);

    await terminarCorrida(corridaId, { ok: true });

    /*
     * Verificar y redactar ya NO son pasos del pipeline automático (decisión
     * de negocio: sin MillionVerifier, y redactar es una acción manual desde
     * /leads — ver el comentario sobre PASOS en corridaService.ts). La
     * corrida ya está `completada` en este punto, igual que va a quedar
     * cualquier corrida real de acá en más.
     *
     * Para que la demo siga mostrando borradores en /revision, este script
     * simula lo que hace el botón "Generar borradores": selecciona todo lo
     * que tiene correo en esta búsqueda (como si un empleado hubiera tildado
     * todo en /leads) y llama a los mismos servicios.
     */
    const v = await verificarPendientes(busquedaId, { verificador: verificadorDeFixture() });
    console.log(`  verificar  → ${v.llamadas} llamadas, ${v.filasActualizadas} filas`);

    const { rows: seleccion } = await poolPostgres().query<{ id: string }>(
      `select distinct p.id from prospecciones p
         join contactos c on c.negocio_id = p.negocio_id
        where p.busqueda_id = $1 and p.estado in ('priorizado', 'contacto_encontrado')
          and c.email is not null`,
      [busquedaId],
    );
    const g = await generarBorradores(seleccion.map((s) => s.id), { generador: generadorDeFixture() });
    console.log(`  redactar   → ${g.generados} borradores`);

    console.log('\nListo. Levantá el panel con `npm run dev` y mirá:');
    console.log('  http://localhost:3000/            tablero');
    console.log(`  http://localhost:3000/corridas/${corridaId}`);
    console.log('  http://localhost:3000/leads       la lista ordenada por score');
    console.log('  http://localhost:3000/revision    los borradores por aprobar');
    console.log('\nPara borrarlo: npm run sembrar -- borrar');
  }
} finally {
  await cerrarPostgres();
}
