/**
 * Contratos del scoring. Capa: dominio (cero dependencias).
 *
 * ===========================================================================
 * LA IDEA: el motor no conoce ninguna señal.
 * ===========================================================================
 *
 * El motor recibe `Regla[]` y produce un score. No menciona "reseñas" ni
 * "pixel de Meta" en ninguna parte. Consecuencias prácticas:
 *
 *   - agregar una señal   = agregar un elemento a un arreglo
 *   - quitar una señal    = comentar ese elemento
 *   - cambiar un peso     = editar un número en la configuración
 *   - cambiar la fórmula  = cambiar una estrategia de combinación
 *
 * Nada de eso toca el motor.
 */

/**
 * Los dos ejes.
 *
 * Las 6 señales que pidió el jefe (ads, actividad, tamaño, antigüedad, reseñas)
 * miden todas lo mismo: **si el negocio puede pagar**. Ninguna mide **si
 * necesita el producto**. Él confirmó el eje que faltaba cuando dijo que una web
 * fea debe SUBIR en la lista, "porque tiene más necesidad".
 *
 * Se mantienen separados porque se combinan multiplicando, no sumando. Ver
 * `combinarGeometrica` en el motor y el por qué ahí.
 */
export const EJES = ['capacidad', 'necesidad'] as const;
export type Eje = (typeof EJES)[number];

/**
 * Lo que una regla recibe para decidir. Deliberadamente plano: si una regla
 * necesitara consultar la base de datos, dejaría de ser pura y de poder probarse
 * sin infraestructura.
 *
 * Todo es nullable porque los datos llegan por etapas: Places da unas cosas, el
 * sitio web otras, RDAP otras. Una regla sin su dato devuelve `indeterminado`.
 */
export type LeadParaScoring = {
  // --- de Places (Fase 1) ---
  rating: number | null;
  num_resenas: number | null;
  sitio_web: string | null;
  dominio: string | null;
  categoria_google: string | null;

  // --- calculado de nuestros propios datos (gratis) ---
  /** Locales que comparten dominio o nombre normalizado. Proxy de "tamaño". */
  sucursales: number | null;

  // --- del sitio del negocio (Fase 2, tabla senales_web) ---
  web_respondio: boolean | null;
  tiene_pixel_meta: boolean | null;
  tiene_tag_google: boolean | null;
  anio_copyright: number | null;
  es_responsive: boolean | null;
  solo_redes: boolean | null;
  tiene_redes: boolean | null;

  // --- del contacto (Fase 2 y 3) ---
  tiene_email: boolean;
  es_rol: boolean | null;

  // --- de RDAP (pendiente) ---
  /** Años desde que se registró el dominio. */
  antiguedad_dominio_anios: number | null;

  /** Año actual, inyectado. Una regla pura no puede llamar a Date.now(). */
  anio_actual: number;
};

/** Lo que devuelve una regla al evaluar un lead. */
export type ResultadoRegla = {
  /**
   * No hay datos para juzgar esta señal.
   *
   * CRÍTICO y no obvio: es distinto de "no cumple". Si no sé la antigüedad del
   * dominio porque no consulté RDAP, eso NO significa que el negocio sea nuevo.
   * Tratarlo como cero castigaría sistemáticamente a los leads de los que
   * sabemos menos — que son justamente los que aún no procesamos.
   * Una regla indeterminada sale del divisor, no suma cero.
   */
  indeterminado: boolean;
  /** 0..1 — qué tan fuerte se cumple la señal. El motor lo multiplica por el peso. */
  fuerza: number;
  /** Para el operador y para el panel. Vía B1: transparencia. null si no aporta. */
  razon: string | null;
};

/**
 * Una señal.
 *
 * `evaluar` es una función pura: mismo lead, mismo resultado. Sin base de datos,
 * sin red, sin reloj. Por eso se puede probar sin infraestructura y por eso el
 * mismo lead siempre da el mismo score (auditable).
 */
export type Regla = {
  /** Estable: se guarda en `score_detalle`. Cambiarlo rompe el histórico. */
  id: string;
  nombre: string;
  eje: Eje;
  /**
   * `puntua` — suma al eje según su peso.
   * `filtro` — eliminatorio: si no se cumple, el lead no es puntuable.
   *   El jefe pidió esto explícitamente para "accesibilidad de contacto".
   *   OJO: eliminatorio del ENVÍO, no de la base. El negocio se guarda igual
   *   (queda en `sin_contacto`). Sigue valiendo "priorizar, no descartar".
   */
  tipo: 'puntua' | 'filtro';
  evaluar: (lead: LeadParaScoring) => ResultadoRegla;
};

/** Peso de cada regla. Fuera del código de la regla para poder moverlo solo. */
export type Pesos = Record<string, number>;

export type DetalleRegla = {
  id: string;
  eje: Eje;
  peso: number;
  puntos: number;
  razon: string | null;
  indeterminado: boolean;
};

export type ResultadoScoring = {
  /** 0..100. null si un filtro eliminatorio lo dejó fuera. */
  score: number | null;
  /** Subtotal 0..100 por eje, antes de combinar. */
  porEje: Record<Eje, number | null>;
  /** Texto para el operador: las señales que sí aportaron. */
  razon: string;
  /** Qué filtro lo dejó fuera, si aplica. */
  filtradoPor: string | null;
  detalle: DetalleRegla[];
};

// ---------------------------------------------------------------------------
// Ayudas para escribir reglas sin repetir código
// ---------------------------------------------------------------------------

export const NO_APLICA: ResultadoRegla = { indeterminado: true, fuerza: 0, razon: null };

export function noCumple(): ResultadoRegla {
  return { indeterminado: false, fuerza: 0, razon: null };
}

export function cumple(fuerza: number, razon: string): ResultadoRegla {
  return {
    indeterminado: false,
    // Acotado por si una regla calcula mal: el motor confía en este rango.
    fuerza: Math.max(0, Math.min(1, fuerza)),
    razon,
  };
}

/**
 * Convierte un valor numérico a fuerza 0..1 con una rampa lineal.
 * Ej: `rampa(num_resenas, 20, 200)` → 0 con 20 reseñas, 1 con 200 o más.
 *
 * Se usa en vez de umbrales duros para que el orden sea gradual: entre un
 * negocio de 150 reseñas y otro de 40 hay diferencia real, y un umbral los
 * empataría.
 */
export function rampa(valor: number, minimo: number, maximo: number): number {
  if (maximo <= minimo) return valor >= maximo ? 1 : 0;
  return Math.max(0, Math.min(1, (valor - minimo) / (maximo - minimo)));
}
