/**
 * Estados del ciclo de vida. Capa: dominio (cero dependencias).
 *
 * ============================================================================
 * FIX DE ARQUITECTURA (c): el estado de tuberia NO es del negocio.
 * ============================================================================
 *
 * Antes: `negocios.estado`.
 * Problema: `aprobado` / `enviado` / `respondio` describen un INTENTO DE VENTA
 * de un producto concreto, no una propiedad de la empresa. Como el Modo 1 es
 * "elige un producto de la lista", el mismo negocio se prospecta para varios
 * productos con el tiempo. Con el estado en `negocios`, un negocio marcado
 * `enviado` para el producto A queda bloqueado para el producto B.
 *
 * Ahora: el estado vive en `prospecciones` = (negocio x busqueda).
 * Una fila por intento. El negocio es el negocio; el intento es el intento.
 *
 * ============================================================================
 * Una verdad, un lugar (fix de la review v1.1, se mantiene)
 * ============================================================================
 *
 * La ENTREGABILIDAD del email NO es un estado de la prospeccion: vive solo en
 * `contactos.estado_verificacion`. El estado de la prospeccion es POSICION en
 * la tuberia; la calidad del email es del CONTACTO. Si estuviera en los dos
 * lados, se desincronizan.
 */

/**
 * Posicion en la tuberia.
 *
 * Nota: se elimino `nuevo` del roadmap original. Una prospeccion no puede
 * existir antes de encontrar el negocio (se crea EN el hallazgo), asi que
 * `nuevo` no era alcanzable. El estado inicial es `negocio_encontrado`.
 */
export const ESTADOS_PROSPECCION = [
  'negocio_encontrado', // inicial: Places lo devolvio y quedo guardado
  'contacto_encontrado', // tiene al menos un email
  'sin_contacto', // lateral: no tiene web/email. NO se borra, queda para revisar
  'priorizado', // ya tiene score + razon
  'correo_generado', // hay borrador
  'aprobado', // un humano lo aprobo
  'enviado',
  'respondio',
  'descartado_por_humano', // terminal
] as const;

export type EstadoProspeccion = (typeof ESTADOS_PROSPECCION)[number];

export const ESTADO_INICIAL: EstadoProspeccion = 'negocio_encontrado';

/** Estados terminales o laterales: la tuberia no sigue avanzando sola. */
export const ESTADOS_TERMINALES: readonly EstadoProspeccion[] = [
  'sin_contacto',
  'descartado_por_humano',
  'respondio',
];

/**
 * Entregabilidad del email. Propiedad del CONTACTO, no de la prospeccion.
 *
 * `pendiente` se agrego al modelo del roadmap: hace falta un valor por defecto
 * para el email que existe pero todavia no paso por el verificador (Fase 3).
 */
export const ESTADOS_VERIFICACION = [
  'pendiente', // por defecto al insertar, antes de verificar
  'verificado',
  'catch_all',
  'invalido',
  'no_encontrado',
] as const;

export type EstadoVerificacion = (typeof ESTADOS_VERIFICACION)[number];

/**
 * Puerta de envio (Via B2: "no quemamos el dominio").
 *
 * ============================================================================
 * DECISION RESUELTA (2026-08-04) — antes estaba pendiente con el jefe
 * ============================================================================
 * La duda original era si `catch_all` debia bloquear el envio (postura
 * conservadora) o dejarlo pasar (en Panama muchos dominios de PYME son
 * catch-all por defecto). Se resolvio junto con otra decision mas grande: no
 * se paga MillionVerifier, asi que ningun contacto real va a llegar a
 * `verificado` nunca — con la puerta vieja (solo `verificado` pasa), la cola de
 * revision iba a quedar vacia por construccion, sin ningun error que lo
 * avisara.
 *
 * La resolucion es la misma que en el resto del proyecto: que decida el
 * empleado, no el sistema solo. La puerta automatica bloquea unicamente lo que
 * es un HECHO TECNICO firme (`invalido`: el verificador confirmo que el correo
 * no existe — eso es un rebote garantizado, no una decision de negocio que
 * alguien pueda asumir a sabiendas). Todo lo demas, incluido `pendiente` —el
 * estado real de todo lo que se genera ahora sin verificador— pasa la puerta.
 *
 * Debe coincidir con `where` de `v_correos_enviables` (migracion 017): es la
 * misma regla en dos lugares porque la vista la aplica en la escritura real y
 * esta constante es la que un test puede leer sin tocar la base.
 */
export const SE_PUEDE_APROBAR_ENVIO: Record<EstadoVerificacion, boolean> = {
  pendiente: true, // el estado real de todo lo generado sin verificador — decide el empleado
  verificado: true,
  catch_all: true, // decide el empleado, ya con la etiqueta visible en la interfaz
  invalido: false, // regla firme: el verificador confirmo que no existe
  no_encontrado: true, // indeterminado, no "no cumple" — mismo criterio que toda la Fase 4
};
