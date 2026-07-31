/**
 * Píldoras de estado. Traducen los estados internos a algo que un empleado
 * entienda, y les ponen color según lo que significan para él.
 *
 * Componentes de servidor (sin `'use client'`): no tienen interactividad, así que
 * no hay razón para mandar JavaScript al navegador por esto.
 */

const TEXTO_CORRIDA: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: 'en cola', clase: 'pildora--alerta' },
  corriendo: { texto: 'buscando', clase: 'pildora--alerta' },
  completada: { texto: 'lista', clase: 'pildora--ok' },
  fallida: { texto: 'falló', clase: 'pildora--riesgo' },
  cancelada: { texto: 'cancelada', clase: '' },
};

export function EstadoCorridaPildora({ estado }: { estado: string }) {
  const e = TEXTO_CORRIDA[estado] ?? { texto: estado, clase: '' };
  return <span className={`pildora ${e.clase}`}>{e.texto}</span>;
}

/**
 * Entregabilidad del email.
 *
 * `catch_all` va en amarillo y no en verde a propósito: es la decisión del jefe
 * de saltarlos. Que se vea distinto evita que alguien piense que es aprobable.
 */
const TEXTO_VERIFICACION: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: 'sin verificar', clase: '' },
  verificado: { texto: 'verificado', clase: 'pildora--ok' },
  catch_all: { texto: 'catch-all', clase: 'pildora--alerta' },
  invalido: { texto: 'inválido', clase: 'pildora--riesgo' },
  no_encontrado: { texto: 'no confirmado', clase: 'pildora--alerta' },
};

export function VerificacionPildora({ estado }: { estado: string | null }) {
  if (estado === null) return <span className="apagado">—</span>;
  const e = TEXTO_VERIFICACION[estado] ?? { texto: estado, clase: '' };
  return <span className={`pildora ${e.clase}`}>{e.texto}</span>;
}

/** Score con color por tramo, para poder escanear la tabla de un vistazo. */
export function Score({ valor }: { valor: number | null }) {
  if (valor === null) {
    return <span className="score score--nulo" title="sin canal de contacto o sin puntuar">—</span>;
  }
  const clase = valor >= 45 ? 'score--alto' : valor >= 25 ? 'score--medio' : 'score--bajo';
  return <span className={`score ${clase}`}>{valor}</span>;
}
