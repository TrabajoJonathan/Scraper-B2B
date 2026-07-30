/**
 * ============================================================================
 * PESOS DEL SCORING — este es el archivo que se edita para calibrar.
 * ============================================================================
 *
 * Cambiar un número de acá NO requiere tocar el motor ni las reglas.
 * Poner un peso en 0 apaga la señal sin borrar nada.
 *
 * Los pesos del eje CAPACIDAD salen de la tabla que mandó el jefe, traduciendo
 * sus etiquetas:
 *
 *   Alto        -> 25
 *   Medio       -> 15
 *   Bajo-medio  ->  8
 *   Filtro      -> no puntúa (es eliminatorio)
 *
 * Los del eje NECESIDAD son propuesta nuestra: él confirmó la dirección
 * ("sube en la lista porque tiene más necesidad") pero no dio pesos. Están
 * marcados abajo para que los revise.
 *
 * A futuro esto puede leerse de la base para que se calibre desde el panel
 * (Fase 6) sin desplegar. Por eso `pesosActuales()` es una función y no una
 * constante: cambiar de dónde vienen los pesos no cambiará a quien los usa.
 */

import type { Pesos } from '../../dominio/scoring.ts';

/** Etiquetas del jefe, traducidas a números. */
export const ALTO = 25;
export const MEDIO = 15;
export const BAJO_MEDIO = 8;

export const PESOS_POR_DEFECTO: Pesos = {
  // -------------------------------------------------------------------------
  // Eje CAPACIDAD — "¿este negocio puede pagar?" (las señales del jefe)
  // -------------------------------------------------------------------------

  /** Él: "Reseñas activas en Google Business" · Medio */
  resenas_activas: MEDIO,

  /**
   * Él: "Tamaño aparente del negocio" · Medio
   * Él proponía # empleados en LinkedIn; usamos # de sucursales, que sale de
   * nuestros propios datos y no requiere scrapear LinkedIn.
   */
  tamano_sucursales: MEDIO,

  /** Él: "Antigüedad del negocio" · Bajo-medio · vía fecha de registro del dominio */
  antiguedad_dominio: BAJO_MEDIO,

  /**
   * Él: "Inversión en ads (Meta Ad Library)" · Alto
   * Reemplazo: el pixel de Meta / tag de Google en su propia página pública.
   * Mantiene el peso Alto porque mide lo mismo con evidencia directa: tener el
   * pixel instalado ES estar corriendo o haber corrido campañas.
   */
  invierte_en_publicidad: ALTO,

  /**
   * Él: "Actividad digital reciente (última publicación IG/FB < 30 días)" · Alto
   *
   * ⚠️ Este es el único donde BAJAMOS el peso a propósito, de Alto a Medio.
   * No podemos medir la RECENCIA de publicaciones sin scrapear Instagram. Lo que
   * sí medimos —que tenga redes visibles y que el sitio esté mantenido— es un
   * proxy más débil. Darle peso Alto haría que una señal floja domine el orden.
   * Si algún día se consigue el dato real, se sube a ALTO y nada más cambia.
   */
  presencia_digital: MEDIO,

  // -------------------------------------------------------------------------
  // Eje NECESIDAD — "¿este negocio necesita lo que vendemos?"
  // Propuesta nuestra. Él confirmó la dirección, no los pesos. ← REVISAR
  // -------------------------------------------------------------------------

  /** Sin sitio web = necesidad máxima para vender sitios. */
  sin_sitio_web: ALTO,

  /** Sitio viejo: copyright vencido o no responsive. */
  web_desactualizada: ALTO,

  /** El "sitio" es un Linktree o una página de Facebook. */
  solo_redes_sociales: MEDIO,
};

/**
 * Pesos vigentes. Hoy devuelve los de arriba; mañana puede leer de la base sin
 * que nadie más se entere.
 */
export function pesosActuales(sobrescribir: Partial<Pesos> = {}): Pesos {
  const pesos: Pesos = { ...PESOS_POR_DEFECTO };
  // Solo se sobrescribe lo que trae valor: un `undefined` suelto borraría el
  // peso por defecto y apagaría la señal sin que nadie lo pidiera.
  for (const [id, peso] of Object.entries(sobrescribir)) {
    if (peso !== undefined) pesos[id] = peso;
  }
  return pesos;
}

/**
 * Cómo se combinan los dos ejes.
 *
 *  - `geometrica` (por defecto) — √(capacidad × necesidad). Castiga el
 *    desbalance: un negocio con plata y sitio impecable da bajo, porque no
 *    necesita. Es el que selecciona el cuadrante "puede pagar Y necesita".
 *  - `suma` — promedio simple. Más fácil de explicar, pero deja subir a negocios
 *    que no necesitan el producto.
 *  - `solo_capacidad` — ignora la necesidad. Es la lista original del jefe tal
 *    cual, útil para comparar contra ella.
 */
export type EstrategiaCombinacion = 'geometrica' | 'suma' | 'solo_capacidad';

export const ESTRATEGIA_POR_DEFECTO: EstrategiaCombinacion = 'geometrica';

/**
 * Piso por eje antes de combinar (solo aplica a `geometrica`).
 *
 * ¿Por qué existe? La primera versión no lo tenía y la prueba destapó el
 * problema: la media geométrica pura ANULA el score cuando un eje da 0.
 * En la corrida real, tres leads quedaron en 0 exacto.
 *
 * Dos razones por las que eso está mal:
 *
 *  1. **Un 0 es un descarte disfrazado.** La regla del proyecto es "priorizar,
 *     no descartar". Un lead en 0 nunca lo va a mirar nadie — es lo mismo que
 *     haberlo borrado, pero sin decirlo.
 *  2. **Tres leads en 0 no tienen orden entre sí.** El punto del scoring es
 *     ordenar; empatar en el fondo pierde información que sí teníamos.
 *
 * Con piso 10: un negocio con capacidad 65 y necesidad 0 da √(65×10) ≈ 25.
 * Sigue muy por debajo del que necesita de verdad, pero queda ordenado y
 * visible. Subirlo acerca la geométrica a la suma; bajarlo a 0 vuelve al
 * comportamiento anulador.
 */
export const PISO_EJE = 10;
