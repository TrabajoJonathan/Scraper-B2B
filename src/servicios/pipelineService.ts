/**
 * pipelineService — el orquestador que avanza UNA corrida UN paso (Fase 7).
 *
 * ===========================================================================
 * La restricción que define este archivo
 * ===========================================================================
 *
 * Una corrida completa tarda minutos; una función de Vercel se corta en decenas
 * de segundos. Así que `ejecutarPaso()` hace **un solo paso** y devuelve el
 * control. El cron lo llama cada minuto hasta que la corrida llega a `listo`.
 *
 * El paso de contacto —el lento, porque baja 60 sitios— además se procesa **por
 * lotes**: N sitios por invocación, con concurrencia. Así ninguna invocación se
 * pasa del límite, sin importar cuántos negocios haya.
 *
 * ===========================================================================
 * Dependencias inyectadas, y por qué eso importa acá
 * ===========================================================================
 *
 * Si hay credenciales, usa las APIs reales. Si no, usa los fixtures. Eso permite
 * mostrar el sistema funcionando sin llaves — pero la corrida queda **marcada**
 * con `con_fixtures = true`, porque un lead inventado se ve idéntico a uno real
 * y dentro de un mes nadie se acordaría.
 */

import { buscar, ZONAS_CIUDAD_PANAMA, type Lector } from './placesService.ts';
import { extraerContacto, type Traer } from './contactoService.ts';
import {
  guardarDescubrimiento, registrarContacto, pendientesDeContacto, marcarSinWeb,
} from './negocioService.ts';
import { verificarPendientes } from './verificarService.ts';
import { priorizar, guardarSenalesWeb } from './scoringService.ts';
import { generarBorradores, type Generador } from './redaccionService.ts';
import { actualizarProgreso, terminarCorrida, type Corrida, type Paso } from './corridaService.ts';
import { poolPostgres } from '../core/postgres.ts';
import { opcional } from '../core/config.ts';
import { buscarTexto } from '../core/places.ts';
import { verificarEmail, type Verificador } from '../core/millionverifier.ts';
import type { SearchSpec } from '../dominio/tipos.ts';

/** Sitios que se bajan por invocación. Bajo a propósito: cada uno tarda hasta 8s. */
const LOTE_CONTACTO = 12;
/** Descargas en paralelo. 12 en serie serían ~96s; con 6 concurrentes, ~16s. */
const CONCURRENCIA = 6;

export type Dependencias = {
  lector: Lector;
  /** undefined = usar el `fetch` real de contactoService. */
  traer: Traer | undefined;
  verificador: Verificador;
  /** undefined = usar Claude. */
  generador: Generador | undefined;
  /** true si ALGUNA es de fixture. Se guarda en la corrida. */
  usaFixtures: boolean;
  faltantes: string[];
  /**
   * Qué partes salieron de fixture, con el nombre que entiende un empleado.
   * Vacío = corrida enteramente real. Se guarda en `corridas.fixtures_en` para
   * que la interfaz pueda decir QUÉ es inventado y no solo que algo lo es.
   */
  partesFixture: string[];
};

/**
 * Elige APIs reales o fixtures según las credenciales disponibles.
 *
 * ===========================================================================
 * Se decide POR INTEGRACIÓN, no todo o nada
 * ===========================================================================
 *
 * Antes bastaba con que faltara UNA llave para que las cuatro dependencias
 * cayeran a fixture. Eso pareció razonable mientras no había ninguna llave,
 * pero es exactamente lo que rompe el caso real: el 2026-08-02 llegaron las de
 * Places y Anthropic, faltaban Apify y MillionVerifier, y el pipeline seguía
 * inventando los negocios teniendo la llave de Places buena en el `.env`.
 *
 * Ahora cada integración mira solo su propia llave. Con Places y Claude puestas,
 * los negocios son reales de Google Maps y los correos los escribe Claude de
 * verdad; solo la verificación de entregabilidad queda simulada.
 *
 * ===========================================================================
 * El fetch de sitios NO depende de una llave: depende de si los negocios son
 * reales
 * ===========================================================================
 *
 * `APIFY_TOKEN` no gobierna nada. Se planeó Apify para los sitios que bloquean
 * un cliente HTTP común, pero eso nunca se implementó: `contactoService` baja
 * la web con un `fetch` normal, sin credenciales. Gatearlo por `APIFY_TOKEN`
 * hacía que la primera corrida con Places real trajera 60 negocios de verdad y
 * cero correos — el fixture de sitios solo conoce las 7 webs inventadas.
 *
 * Lo que de verdad acopla al fetch es el ORIGEN DE LOS NEGOCIOS. Los negocios
 * de fixture tienen URLs que no existen, así que bajarlas de verdad no
 * devolvería nada; y los negocios reales tienen webs reales, que hay que bajar
 * de verdad. Por eso `traer` sigue a `lector` y no a una variable de entorno.
 *
 * ===========================================================================
 *
 * La corrida se sigue marcando con `con_fixtures = true` si CUALQUIER parte es
 * inventada — mezclar datos reales con datos falsos es más peligroso que tener
 * todo falso, no menos, porque el negocio real le da credibilidad al email
 * inventado. Por eso además se guarda QUÉ parte lo es.
 *
 * Los fixtures se importan de forma dinámica: la parte que tenga llave real
 * nunca carga su fixture, y con las llaves puestas no viaja ninguno al bundle.
 */
export async function dependenciasAutomaticas(): Promise<Dependencias> {
  const hayPlaces = opcional('GOOGLE_PLACES_API_KEY') !== undefined;
  const hayClaude = opcional('ANTHROPIC_API_KEY') !== undefined;
  const hayVerificador = opcional('MILLIONVERIFIER_API_KEY') !== undefined;

  const faltantes: string[] = [];
  if (!hayPlaces) faltantes.push('GOOGLE_PLACES_API_KEY');
  if (!hayClaude) faltantes.push('ANTHROPIC_API_KEY');
  if (!hayVerificador) faltantes.push('MILLIONVERIFIER_API_KEY');

  const partesFixture: string[] = [];
  // Un solo item para negocios + webs: son la misma decisión, y al empleado le
  // da igual que por dentro sean dos módulos.
  if (!hayPlaces) partesFixture.push('los negocios y sus sitios web');
  if (!hayVerificador) partesFixture.push('la verificación de entregabilidad');
  if (!hayClaude) partesFixture.push('la redacción de los correos');

  // Cada import es dinámico y condicional: solo se carga el fixture que hace
  // falta. `undefined` significa «usá la implementación real del servicio».
  const lector: Lector = hayPlaces
    ? (p) => buscarTexto(p)
    : (await import('../fixtures/places-restaurantes-panama.ts')).lectorDeFixture();

  const traer: Traer | undefined = hayPlaces
    ? undefined // negocios reales -> bajar sus webs de verdad, con `fetch`
    : (await import('../fixtures/sitios-web-panama.ts')).traerDeFixture();

  const verificador: Verificador = hayVerificador
    ? verificarEmail
    : (await import('../fixtures/verificaciones.ts')).verificadorDeFixture();

  const generador: Generador | undefined = hayClaude
    ? undefined // redaccionService usa Claude
    : (await import('../fixtures/borradores.ts')).generadorDeFixture();

  return {
    lector,
    traer,
    verificador,
    generador,
    usaFixtures: partesFixture.length > 0,
    faltantes,
    partesFixture,
  };
}

/** Corre `tareas` con concurrencia limitada. Sin dependencias externas. */
async function enParalelo<T>(
  items: T[],
  limite: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (i < items.length) {
      const mio = items[i++];
      if (mio !== undefined) await fn(mio);
    }
  });
  await Promise.all(trabajadores);
}

export type ResultadoPaso = {
  corridaId: string;
  pasoEjecutado: Paso;
  pasoSiguiente: Paso;
  detalle: string;
  termino: boolean;
};

/**
 * Avanza una corrida exactamente un paso.
 *
 * Si el paso no terminó (quedan sitios por bajar), devuelve el MISMO paso: el
 * cron lo va a volver a llamar. Es lo que permite procesar 200 negocios sin que
 * ninguna invocación se pase del límite.
 */
export async function ejecutarPaso(
  corrida: Corrida,
  deps: Dependencias,
): Promise<ResultadoPaso> {
  const spec: SearchSpec = {
    producto: corrida.producto,
    categoria: corrida.categoria,
    ubicacion: corrida.ubicacion,
    canal: 'google_maps',
  };
  const bid = corrida.busqueda_id;
  const base = { corridaId: corrida.id, pasoEjecutado: corrida.paso, termino: false };

  switch (corrida.paso) {
    // -----------------------------------------------------------------------
    case 'descubrir': {
      const { negocios } = await buscar(spec, { limite: 60, lector: deps.lector });
      const r = await guardarDescubrimiento(bid, negocios);
      // `progreso_total` se fija recién acá: antes de descubrir no se sabe
      // cuántos negocios hay, y poner un número inventado haría que la barra
      // salte hacia atrás cuando aparezca el real.
      await actualizarProgreso(corrida.id, {
        paso: 'contacto', hecho: 0, total: r.prospeccionesNuevas + r.prospeccionesRepetidas,
      });
      return {
        ...base,
        pasoSiguiente: 'contacto',
        detalle: `${negocios.length} negocios · ${r.negociosNuevos} nuevos · ${r.omitidosNoProspectables} cerrados`,
      };
    }

    // -----------------------------------------------------------------------
    case 'contacto': {
      const todos = await pendientesDeContacto(bid);
      const lote = todos.slice(0, LOTE_CONTACTO);

      if (lote.length === 0) {
        // No queda nadie con web sin revisar: cerrar a los que no tienen web
        // (si no, se quedan varados) y pasar al siguiente paso.
        const varados = await marcarSinWeb(bid);
        await actualizarProgreso(corrida.id, { paso: 'verificar' });
        return {
          ...base,
          pasoSiguiente: 'verificar',
          detalle: `contacto terminado · ${varados} sin web marcados`,
        };
      }

      let ok = 0;
      await enParalelo(lote, CONCURRENCIA, async (p) => {
        const c = await extraerContacto(p.sitioWeb, p.dominio, {
          ...(deps.traer === undefined ? {} : { traer: deps.traer }),
        });
        await registrarContacto(p.negocioId, p.prospeccionId, {
          email: c.email, redes: c.redes, origen: c.origen, ofuscado: c.ofuscado,
        });
        await guardarSenalesWeb(p.negocioId, c.sitioRespondio, c.senalesWeb, c.soloRedes);
        if (c.email !== null) ok += 1;
      });

      const { rows } = await poolPostgres().query<{ n: string }>(
        `select count(*)::text as n from prospecciones
         where busqueda_id = $1 and estado <> 'negocio_encontrado'`,
        [bid],
      );
      await actualizarProgreso(corrida.id, { hecho: Number(rows[0]!.n) });

      // Mismo paso: quedan más. El cron vuelve.
      return {
        ...base,
        pasoSiguiente: 'contacto',
        detalle: `${lote.length} sitios revisados · ${ok} con correo · quedan ${todos.length - lote.length}`,
      };
    }

    // -----------------------------------------------------------------------
    case 'verificar': {
      const v = await verificarPendientes(bid, { verificador: deps.verificador });
      await actualizarProgreso(corrida.id, { paso: 'priorizar' });
      return {
        ...base,
        pasoSiguiente: 'priorizar',
        detalle: `${v.llamadas} llamadas · ${v.filasActualizadas} filas · ${v.llamadasAhorradas} ahorradas · $${v.costoUSD.toFixed(4)}`,
      };
    }

    // -----------------------------------------------------------------------
    case 'priorizar': {
      const p = await priorizar(bid);
      await actualizarProgreso(corrida.id, { paso: 'redactar' });
      return {
        ...base,
        pasoSiguiente: 'redactar',
        detalle: `${p.conScore} con score · promedio ${p.scorePromedio} · ${p.filtrados} sin canal`,
      };
    }

    // -----------------------------------------------------------------------
    case 'redactar': {
      const g = await generarBorradores(bid, {
        ...(deps.generador === undefined ? {} : { generador: deps.generador }),
      });
      await terminarCorrida(corrida.id, { ok: true });
      return {
        ...base,
        pasoSiguiente: 'listo',
        termino: true,
        detalle: `${g.generados} borradores · ${g.omitidosPorBuzonCompartido} omitidos por buzón compartido · $${g.costoUSD.toFixed(4)}`,
      };
    }

    // -----------------------------------------------------------------------
    case 'listo':
      await terminarCorrida(corrida.id, { ok: true });
      return { ...base, pasoSiguiente: 'listo', termino: true, detalle: 'ya estaba lista' };
  }
}

/**
 * Una invocación del cron: toma una corrida y le da un paso.
 *
 * Si algo revienta, la corrida queda en `fallida` con el mensaje guardado — que
 * es lo que hace que el fallo sea VISIBLE en la interfaz en vez de morir en un
 * log. Sin esto, una corrida rota se quedaría en "buscando" para siempre y nadie
 * sabría por qué.
 */
export async function tick(): Promise<{
  hizoAlgo: boolean;
  resultado?: ResultadoPaso;
  error?: string;
  usaFixtures?: boolean;
}> {
  const { tomarSiguienteCorrida } = await import('./corridaService.ts');
  const corrida = await tomarSiguienteCorrida();
  if (corrida === null) return { hizoAlgo: false };

  const deps = await dependenciasAutomaticas();

  // Se guarda también QUÉ parte es inventada, no solo que algo lo es: desde que
  // hay llaves para unas integraciones y no para otras, una corrida puede tener
  // negocios reales con correos falsos, y el aviso tiene que poder decir cuál
  // es cuál. Se reescribe en cada paso porque un paso posterior puede caer a
  // fixture aunque el anterior haya sido real.
  if (deps.usaFixtures) {
    await poolPostgres().query(
      `update corridas set con_fixtures = true, fixtures_en = $2 where id = $1`,
      [corrida.id, deps.partesFixture],
    );
  }

  try {
    const resultado = await ejecutarPaso(corrida, deps);
    return { hizoAlgo: true, resultado, usaFixtures: deps.usaFixtures };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    await terminarCorrida(corrida.id, { ok: false, error: mensaje });
    return { hizoAlgo: true, error: mensaje, usaFixtures: deps.usaFixtures };
  }
}

export { ZONAS_CIUDAD_PANAMA };
