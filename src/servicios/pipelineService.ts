/**
 * pipelineService — el orquestador que avanza UNA corrida UN paso (Fase 7).
 *
 * ===========================================================================
 * La restricción que define este archivo
 * ===========================================================================
 *
 * Una corrida completa tarda más que el límite de una función. Así que
 * `ejecutarPaso()` hace **un solo paso** y devuelve el control. Quien la llame
 * —hoy, la pantalla de detalle mientras está abierta; antes, un cron— la va
 * llamando de nuevo hasta que la corrida llega a `listo`.
 *
 * El paso de contacto —el lento, porque baja sitios web reales— además se
 * procesa **por lotes**: N sitios por invocación, con concurrencia. Así
 * ninguna invocación se pasa del límite, sin importar cuántos negocios haya.
 *
 * ===========================================================================
 * Dependencias inyectadas, y por qué eso importa acá
 * ===========================================================================
 *
 * Si hay credenciales, usa las APIs reales. Si no, usa los fixtures. Eso permite
 * mostrar el sistema funcionando sin llaves — pero la corrida queda **marcada**
 * con `con_fixtures = true`, porque un lead inventado se ve idéntico a uno real
 * y dentro de un mes nadie se acordaría.
 *
 * `verificador` no está entre las dependencias: sin MillionVerifier (decisión
 * de negocio, no una llave que falte "todavía"), no hay nada real que llamar,
 * y simularlo con un fixture sobre negocios REALES fabricaría un veredicto de
 * verificación que nunca pasó. Ver el comentario de `PASOS` en
 * `corridaService.ts`.
 */

import { buscar, ZONAS_CIUDAD_PANAMA, type Lector } from './placesService.ts';
import { extraerContacto, type Traer } from './contactoService.ts';
import {
  guardarDescubrimiento, registrarContacto, pendientesDeContacto, marcarSinWeb,
} from './negocioService.ts';
import { priorizar, guardarSenalesWeb } from './scoringService.ts';
import {
  actualizarProgreso, terminarCorrida, tomarSiguienteCorrida, tomarCorridaPorId,
  type Corrida, type Paso,
} from './corridaService.ts';
import { poolPostgres } from '../core/postgres.ts';
import { opcional } from '../core/config.ts';
import { buscarTexto } from '../core/places.ts';
import type { SearchSpec } from '../dominio/tipos.ts';

/** Sitios que se bajan por invocación. Bajo a propósito: cada uno tarda hasta 8s. */
const LOTE_CONTACTO = 12;
/** Descargas en paralelo. 12 en serie serían ~96s; con 6 concurrentes, ~16s. */
const CONCURRENCIA = 6;

export type Dependencias = {
  lector: Lector;
  /** undefined = usar el `fetch` real de contactoService. */
  traer: Traer | undefined;
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
 * Elige APIs reales o fixtures según las credenciales disponibles, para las
 * integraciones que el avance AUTOMÁTICO de una corrida usa: descubrir
 * negocios y bajar sus sitios. `verificador` y `generador` no están acá — ver
 * el comentario grande sobre `PASOS` en `corridaService.ts` para el por qué.
 *
 * ===========================================================================
 * Se decide POR INTEGRACIÓN, no todo o nada
 * ===========================================================================
 *
 * Antes bastaba con que faltara UNA llave para que todo cayera a fixture. Eso
 * pareció razonable mientras no había ninguna llave, pero es exactamente lo
 * que rompió el caso real del 2026-08-02: llegaron Places y Anthropic, y el
 * pipeline seguía inventando negocios por faltar otra llave sin relación.
 *
 * ===========================================================================
 * El fetch de sitios NO depende de una llave: depende de si los negocios son
 * reales
 * ===========================================================================
 *
 * Lo que de verdad acopla al fetch es el ORIGEN DE LOS NEGOCIOS. Los negocios
 * de fixture tienen URLs que no existen, así que bajarlas de verdad no
 * devolvería nada; y los negocios reales tienen webs reales, que hay que bajar
 * de verdad. Por eso `traer` sigue a `lector`.
 *
 * ===========================================================================
 *
 * La corrida se sigue marcando con `con_fixtures = true` si CUALQUIER parte es
 * inventada — mezclar datos reales con datos falsos es más peligroso que tener
 * todo falso, no menos, porque el negocio real le da credibilidad al dato
 * falso. Por eso además se guarda QUÉ parte lo es.
 *
 * Los fixtures se importan de forma dinámica: con las llaves puestas, ninguno
 * viaja al bundle.
 */
export async function dependenciasAutomaticas(): Promise<Dependencias> {
  const hayPlaces = opcional('GOOGLE_PLACES_API_KEY') !== undefined;

  const faltantes: string[] = [];
  if (!hayPlaces) faltantes.push('GOOGLE_PLACES_API_KEY');

  const partesFixture: string[] = [];
  // Un solo item para negocios + webs: son la misma decisión, y al empleado le
  // da igual que por dentro sean dos módulos.
  if (!hayPlaces) partesFixture.push('los negocios y sus sitios web');

  const lector: Lector = hayPlaces
    ? (p) => buscarTexto(p)
    : (await import('../fixtures/places-restaurantes-panama.ts')).lectorDeFixture();

  const traer: Traer | undefined = hayPlaces
    ? undefined // negocios reales -> bajar sus webs de verdad, con `fetch`
    : (await import('../fixtures/sitios-web-panama.ts')).traerDeFixture();

  return {
    lector,
    traer,
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
        // (si no, se quedan varados) y pasar directo a priorizar. Ya no hay
        // paso "verificar" en el medio — ver el comentario sobre PASOS en
        // corridaService.ts.
        const varados = await marcarSinWeb(bid);
        await actualizarProgreso(corrida.id, { paso: 'priorizar' });
        return {
          ...base,
          pasoSiguiente: 'priorizar',
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
    // Último paso automático. Antes seguía a "redactar"; ya no: sin
    // verificación real, redactar para todos ya no tiene sentido, y pasa a
    // ser una acción manual desde /leads (ver corridaService.ts, PASOS).
    case 'priorizar': {
      const p = await priorizar(bid);
      await terminarCorrida(corrida.id, { ok: true });
      return {
        ...base,
        pasoSiguiente: 'listo',
        termino: true,
        detalle: `${p.conScore} con score · promedio ${p.scorePromedio} · ${p.filtrados} sin canal`,
      };
    }

    // -----------------------------------------------------------------------
    case 'listo':
      await terminarCorrida(corrida.id, { ok: true });
      return { ...base, pasoSiguiente: 'listo', termino: true, detalle: 'ya estaba lista' };
  }
}

export type ResultadoAvance = {
  hizoAlgo: boolean;
  resultado?: ResultadoPaso;
  error?: string;
  usaFixtures?: boolean;
};

/**
 * Resuelve dependencias, marca fixtures y corre el paso — para una corrida ya
 * tomada (bloqueada con `for update`). Común a `tick()` y a
 * `avanzarCorridaEspecifica()`; lo único que cambia entre esas dos es CÓMO se
 * elige la corrida, no qué se hace una vez elegida.
 *
 * Si algo revienta, la corrida queda en `fallida` con el mensaje guardado — que
 * es lo que hace que el fallo sea VISIBLE en la interfaz en vez de morir en un
 * log. Sin esto, una corrida rota se quedaría en "buscando" para siempre y
 * nadie sabría por qué.
 */
async function avanzarCorridaTomada(corrida: Corrida): Promise<ResultadoAvance> {
  const deps = await dependenciasAutomaticas();

  // Se guarda también QUÉ parte es inventada, no solo que algo lo es: un
  // negocio real puede convivir con una web de fixture si a mitad de camino
  // se acaba la llave, y el aviso tiene que poder decir cuál es cuál. Se
  // reescribe en cada paso porque un paso posterior puede caer a fixture
  // aunque el anterior haya sido real.
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

/**
 * Toma la corrida pendiente más vieja de TODAS y le da un paso.
 *
 * Uso: `npm run cron` — un único invocador que vacía la cola en orden. No es
 * lo que usa la pantalla de detalle (ver `avanzarCorridaEspecifica`): con
 * varias corridas pendientes a la vez, esto podría avanzar una distinta a la
 * que el empleado está mirando.
 */
export async function tick(): Promise<ResultadoAvance> {
  const corrida = await tomarSiguienteCorrida();
  if (corrida === null) return { hizoAlgo: false };
  return avanzarCorridaTomada(corrida);
}

/**
 * Le da un paso a UNA corrida puntual. Es lo que llama la ruta que la pantalla
 * de detalle va sondeando mientras está abierta (ver `Avanzador.tsx`).
 */
export async function avanzarCorridaEspecifica(id: string): Promise<ResultadoAvance> {
  const corrida = await tomarCorridaPorId(id);
  if (corrida === null) return { hizoAlgo: false };
  return avanzarCorridaTomada(corrida);
}

export { ZONAS_CIUDAD_PANAMA };
