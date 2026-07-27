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
 * >>> DECISION PENDIENTE CON EL JEFE <<<
 * `catch_all` esta en false a proposito, como postura conservadora. En Panama
 * muchisimos dominios de PYME son catch-all (cPanel por defecto), asi que esta
 * eleccion puede recortar buena parte de la lista. La alternativa es enviarles
 * con cupo diario aparte y prioridad menor.
 * Hay que decidirlo en la Fase 3, no descubrirlo en B6. Ver ROADMAP, "Decisiones
 * pendientes con el jefe" #6.
 */
export const SE_PUEDE_APROBAR_ENVIO: Record<EstadoVerificacion, boolean> = {
  pendiente: false, // sin verificar no se aprueba
  verificado: true,
  catch_all: false, // <-- pendiente de decision
  invalido: false, // regla firme de B2
  no_encontrado: false,
};
