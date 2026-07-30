/**
 * ============================================================================
 * LAS REGLAS — una señal por regla, independientes entre sí.
 * ============================================================================
 *
 * Para AGREGAR una señal:
 *   1. escribir la regla acá
 *   2. agregarla al arreglo `REGLAS` del final
 *   3. ponerle peso en `configuracion.ts`
 * El motor no se toca.
 *
 * Para QUITARLA: sacarla del arreglo (o ponerle peso 0, que la apaga sin
 * perder el histórico de `score_detalle`).
 *
 * Cada `evaluar` es PURO: sin base de datos, sin red, sin `Date.now()`. Por eso
 * se prueban solas y por eso el mismo lead siempre saca el mismo score, que es
 * lo que lo hace auditable frente al jefe.
 */

import {
  cumple,
  noCumple,
  rampa,
  NO_APLICA,
  type Regla,
} from '../../dominio/scoring.ts';

// ===========================================================================
// EJE CAPACIDAD — "¿puede pagar?" (las señales que pidió el jefe)
// ===========================================================================

/**
 * Él: "Reseñas activas en Google Business · # reseñas y fecha de la más reciente"
 *
 * El # lo da Places gratis. La FECHA de la más reciente requiere pedir el campo
 * `reviews`, que cae en un SKU más caro — pendiente de decidir si vale la pena.
 * Por ahora solo el volumen, y la rampa va de 20 a 200: debajo de 20 reseñas no
 * hay señal, arriba de 200 ya no aporta más distinguir.
 */
const resenasActivas: Regla = {
  id: 'resenas_activas',
  nombre: 'Reseñas activas en Google',
  eje: 'capacidad',
  tipo: 'puntua',
  evaluar: (l) => {
    if (l.num_resenas === null) return NO_APLICA;
    if (l.num_resenas < 20) return noCumple();
    const f = rampa(l.num_resenas, 20, 200);
    const conRating = l.rating !== null ? ` y ${l.rating}★` : '';
    return cumple(f, `${l.num_resenas} reseñas${conRating}`);
  },
};

/**
 * Él: "Tamaño aparente del negocio · # empleados en LinkedIn, # sucursales"
 *
 * Los empleados en LinkedIn quedan fuera: es el scraping que él mismo descartó.
 * Usamos # de sucursales, que sale GRATIS de nuestros propios datos — negocios
 * que comparten dominio o nombre normalizado. Ya lo detectamos en la Fase 2
 * cuando aparecieron las 2 sucursales de la cadena.
 *
 * 1 local no dice nada; 2 ya es una cadena chica; 8 o más es una operación seria.
 */
const tamanoSucursales: Regla = {
  id: 'tamano_sucursales',
  nombre: 'Tamaño (sucursales)',
  eje: 'capacidad',
  tipo: 'puntua',
  evaluar: (l) => {
    if (l.sucursales === null) return NO_APLICA;
    if (l.sucursales < 2) return noCumple();
    return cumple(rampa(l.sucursales, 2, 8), `${l.sucursales} sucursales`);
  },
};

/**
 * Él: "Antigüedad del negocio · fecha de registro del dominio · Bajo-medio"
 *
 * Se saca por RDAP (el reemplazo moderno y oficial de WHOIS): protocolo público,
 * gratis y sin problema de ToS. Todavía no está integrado, así que hoy devuelve
 * indeterminado — que NO es lo mismo que "el negocio es nuevo".
 *
 * Rampa de 2 a 10 años: menos de 2 puede ser un negocio que no arranca; más de
 * 10 ya no distingue.
 */
const antiguedadDominio: Regla = {
  id: 'antiguedad_dominio',
  nombre: 'Antigüedad del dominio',
  eje: 'capacidad',
  tipo: 'puntua',
  evaluar: (l) => {
    if (l.antiguedad_dominio_anios === null) return NO_APLICA;
    if (l.antiguedad_dominio_anios < 2) return noCumple();
    return cumple(
      rampa(l.antiguedad_dominio_anios, 2, 10),
      `${l.antiguedad_dominio_anios} años operando (por el dominio)`,
    );
  },
};

/**
 * Él: "Inversión en ads · Meta Ad Library · Alto"
 *
 * REEMPLAZO: el pixel de Meta o el tag de Google en su propia página pública.
 * Es evidencia directa de lo mismo —tener el pixel instalado ES correr o haber
 * corrido campañas— y sale del HTML que la Fase 2 ya descarga: cero peticiones
 * extra, cero riesgo de ToS.
 *
 * Los dos juntos valen más que uno: quien tiene pixel de Meta Y tag de Google
 * está invirtiendo en serio.
 */
const invierteEnPublicidad: Regla = {
  id: 'invierte_en_publicidad',
  nombre: 'Invierte en publicidad',
  eje: 'capacidad',
  tipo: 'puntua',
  evaluar: (l) => {
    if (l.tiene_pixel_meta === null && l.tiene_tag_google === null) return NO_APLICA;
    const meta = l.tiene_pixel_meta === true;
    const google = l.tiene_tag_google === true;
    if (!meta && !google) return noCumple();
    if (meta && google) return cumple(1, 'corre publicidad en Meta y Google');
    return cumple(0.65, meta ? 'tiene pixel de Meta' : 'tiene tag de Google Ads');
  },
};

/**
 * Él: "Actividad digital reciente · última publicación IG/FB < 30 días · Alto"
 *
 * No se puede medir la recencia de publicaciones sin scrapear Instagram. Lo que
 * sí se mide: que tenga redes visibles y que el sitio esté mantenido (año del
 * copyright al día).
 *
 * Por eso su peso baja a MEDIO en la configuración: es un proxy más flojo, y
 * darle peso Alto dejaría que una señal débil domine el orden.
 */
const presenciaDigital: Regla = {
  id: 'presencia_digital',
  nombre: 'Presencia digital viva',
  eje: 'capacidad',
  tipo: 'puntua',
  evaluar: (l) => {
    if (l.tiene_redes === null && l.anio_copyright === null) return NO_APLICA;

    const redes = l.tiene_redes === true;
    // "Al día" = este año o el pasado. Muchos sitios no actualizan el footer en
    // enero, así que exigir el año exacto daría falsos negativos.
    const alDia = l.anio_copyright !== null && l.anio_copyright >= l.anio_actual - 1;

    if (redes && alDia) return cumple(1, 'redes activas y sitio mantenido');
    if (alDia) return cumple(0.6, `sitio mantenido (copyright ${l.anio_copyright})`);
    if (redes) return cumple(0.5, 'tiene redes sociales visibles');
    return noCumple();
  },
};

// ===========================================================================
// EJE NECESIDAD — "¿necesita lo que vendemos?"
//
// Este eje NO estaba en la lista del jefe. Él lo confirmó al responder que una
// web fea "sube en la lista porque tiene más necesidad".
//
// Ojo con algo interesante: para vender sitios web, los dos ejes están
// NEGATIVAMENTE correlacionados — quien mantiene su sitio tiene capacidad pero
// no necesidad. Por eso la media geométrica no es un adorno: selecciona
// justamente al negocio con plata que aun así descuidó su web.
// ===========================================================================

/** Sin sitio web: la necesidad más clara que existe para vender sitios. */
const sinSitioWeb: Regla = {
  id: 'sin_sitio_web',
  nombre: 'Sin sitio web',
  eje: 'necesidad',
  tipo: 'puntua',
  evaluar: (l) =>
    l.sitio_web === null
      ? cumple(1, 'no tiene sitio web')
      : noCumple(),
};

/**
 * Sitio desactualizado. Dos evidencias, y se suman:
 *  - no es responsive (sin `<meta viewport>`): en 2026 eso es un sitio de hace años
 *  - copyright vencido: si dice 2019, está abandonado
 *
 * Un sitio que falla en ambas es el candidato ideal para rehacer.
 */
const webDesactualizada: Regla = {
  id: 'web_desactualizada',
  nombre: 'Sitio desactualizado',
  eje: 'necesidad',
  tipo: 'puntua',
  evaluar: (l) => {
    // Sin sitio no aplica: de eso ya se encarga `sin_sitio_web`. Si contara acá
    // también, el mismo hecho puntuaría dos veces.
    if (l.sitio_web === null) return NO_APLICA;
    if (l.web_respondio === false) {
      return cumple(1, 'el sitio no carga');
    }
    if (l.es_responsive === null && l.anio_copyright === null) return NO_APLICA;

    const noResponsive = l.es_responsive === false;
    const anios = l.anio_copyright === null ? null : l.anio_actual - l.anio_copyright;
    const viejo = anios !== null && anios >= 3;

    if (noResponsive && viejo) {
      return cumple(1, `sitio de ${l.anio_copyright} y no responsive`);
    }
    if (noResponsive) return cumple(0.75, 'el sitio no es responsive');
    if (viejo) return cumple(0.6, `copyright de ${l.anio_copyright}`);
    return noCumple();
  },
};

/** El "sitio web" es en realidad un Linktree o una página de Facebook. */
const soloRedesSociales: Regla = {
  id: 'solo_redes_sociales',
  nombre: 'Solo redes sociales',
  eje: 'necesidad',
  tipo: 'puntua',
  evaluar: (l) => {
    if (l.solo_redes === null) return NO_APLICA;
    return l.solo_redes
      ? cumple(1, 'su "sitio" es una red social o Linktree')
      : noCumple();
  },
};

// ===========================================================================
// FILTRO ELIMINATORIO
// ===========================================================================

/**
 * Él: "Accesibilidad de contacto · tiene correo, teléfono o WhatsApp visible
 * (no solo formulario roto) · Filtro eliminatorio, NO puntúa"
 *
 * Es un filtro, no una señal: sin un canal para escribirle, el score no sirve
 * de nada.
 *
 * ⚠️ Eliminatorio del ENVÍO, no de la base de datos. El negocio se guarda igual
 * y la prospección queda en `sin_contacto` para revisar. Sigue valiendo
 * "priorizar, no descartar": no lo borramos, solo reconocemos que hoy no hay por
 * dónde contactarlo.
 */
const contactoAccesible: Regla = {
  id: 'contacto_accesible',
  nombre: 'Contacto accesible',
  eje: 'capacidad',
  tipo: 'filtro',
  evaluar: (l) => (l.tiene_email ? cumple(1, 'tiene correo') : noCumple()),
};

// ===========================================================================
// EL REGISTRO
// ===========================================================================

/**
 * Agregar una señal = agregar una línea acá.
 * Quitarla = comentar la línea (o ponerle peso 0 en `configuracion.ts`, que la
 * apaga sin perder el histórico).
 */
export const REGLAS: readonly Regla[] = [
  // filtro primero: si no pasa, no vale calcular el resto
  contactoAccesible,

  // eje capacidad (lista del jefe)
  invierteEnPublicidad,
  presenciaDigital,
  resenasActivas,
  tamanoSucursales,
  antiguedadDominio,

  // eje necesidad (confirmado por él, pesos por revisar)
  sinSitioWeb,
  webDesactualizada,
  soloRedesSociales,
];
