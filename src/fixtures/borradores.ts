/**
 * ============================================================================
 * BORRADORES SINTÉTICOS. No los escribió Claude.
 * ============================================================================
 *
 * Sirven para probar la persistencia y el flujo de revisión sin gastar créditos
 * ni esperar la llave. **No dicen nada sobre la calidad real de los correos** —
 * eso solo se sabe leyendo salida de verdad, y es lo primero que hay que hacer
 * cuando llegue la llave de Claude.
 *
 * El generador de fixture SÍ respeta las reglas duras del prompt (menos de 150
 * palabras, una sola CTA, usa el dato personalizador que se le pasa), para que
 * la persistencia y las validaciones se prueben contra algo con la forma
 * correcta.
 */

import type { Generador } from '../servicios/redaccionService.ts';

/** Precio real de Haiku 4.5 por correo, para que el conteo de costo sea creíble. */
const COSTO_SIMULADO = 0.0038;

/**
 * Generador de fixture. Cuenta las llamadas, para poder afirmar que NO se
 * generó de más (el ahorro por buzón compartido).
 */
export function generadorDeFixture(): Generador & { llamadas: () => number } {
  let n = 0;

  const fn: Generador = async ({ usuario, modelo }) => {
    n += 1;

    // El prompt de usuario trae los datos en líneas "Clave: valor". Se leen para
    // que el borrador sea coherente con el negocio, igual que haría Claude.
    const leer = (clave: string): string => {
      const linea = usuario.split('\n').find((l) => l.startsWith(`${clave}:`));
      return linea === undefined ? '' : linea.slice(clave.length + 1).trim();
    };

    const negocio = leer('Negocio');
    const producto = leer('Producto a vender');
    const dato = leer('Dato personalizador que DEBES usar');

    return {
      borrador: {
        asunto: `Una idea para ${negocio.split(',')[0]?.slice(0, 40) ?? negocio}`,
        cuerpo:
          `Buenas, vi que ${negocio} ${dato}.\n\n` +
          `En Codeflow hacemos ${producto}. Para un negocio con ese nivel de ` +
          `movimiento suele significar menos trabajo manual y más pedidos que ` +
          `entran solos.\n\n` +
          `¿Le sirve una llamada de 15 minutos esta semana para ver si aplica?`,
        cta: '¿Le sirve una llamada de 15 minutos esta semana para ver si aplica?',
        dato_personalizador_usado: dato,
      },
      modelo,
      costoUSD: COSTO_SIMULADO,
    };
  };

  return Object.assign(fn, { llamadas: () => n });
}

/** Simula que Claude rechaza la petición (stop_reason: refusal). */
export function generadorQueRechaza(): Generador {
  return async () => {
    throw new Error(
      'Claude rechazo la peticion (stop_reason: refusal). Revisar el prompt; no reintentar igual.',
    );
  };
}
