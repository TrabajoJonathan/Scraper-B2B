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
  /** true si alguna es de fixture. Se guarda en la corrida. */
  usaFixtures: boolean;
  faltantes: string[];
};

/**
 * Elige APIs reales o fixtures según las credenciales disponibles.
 *
 * Los fixtures se importan de forma dinámica: si mañana hay todas las llaves,
 * este módulo nunca los carga y no viajan al bundle de producción.
 */
export async function dependenciasAutomaticas(): Promise<Dependencias> {
  const faltantes: string[] = [];
  if (opcional('GOOGLE_PLACES_API_KEY') === undefined) faltantes.push('GOOGLE_PLACES_API_KEY');
  if (opcional('ANTHROPIC_API_KEY') === undefined) faltantes.push('ANTHROPIC_API_KEY');
  if (opcional('MILLIONVERIFIER_API_KEY') === undefined) faltantes.push('MILLIONVERIFIER_API_KEY');
  if (opcional('APIFY_TOKEN') === undefined) faltantes.push('APIFY_TOKEN');

  if (faltantes.length === 0) {
    return {
      lector: (p) => buscarTexto(p),
      traer: undefined, // contactoService usa su `fetch` real
      verificador: verificarEmail,
      generador: undefined, // redaccionService usa Claude
      usaFixtures: false,
      faltantes,
    };
  }

  const [places, sitios, verif, borr] = await Promise.all([
    import('../fixtures/places-restaurantes-panama.ts'),
    import('../fixtures/sitios-web-panama.ts'),
    import('../fixtures/verificaciones.ts'),
    import('../fixtures/borradores.ts'),
  ]);

  return {
    lector: places.lectorDeFixture(),
    traer: sitios.traerDeFixture(),
    verificador: verif.verificadorDeFixture(),
    generador: borr.generadorDeFixture(),
    usaFixtures: true,
    faltantes,
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

  if (deps.usaFixtures && !corrida.con_fixtures) {
    await poolPostgres().query(`update corridas set con_fixtures = true where id = $1`, [
      corrida.id,
    ]);
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
