/**
 * Píldoras de estado. Traducen los estados internos a algo que un empleado
 * entienda, y les ponen color según lo que significan para él.
 *
 * Componentes de servidor (sin `'use client'`): no tienen interactividad, así que
 * no hay razón para mandar JavaScript al navegador por esto.
 *
 * ---------------------------------------------------------------------------
 * Regla de color del rediseño: el color solo aparece cuando previene un error.
 * ---------------------------------------------------------------------------
 * «en cola» y «buscando» ya NO van en amarillo. El amarillo estaba diciendo
 * «ojo, algo va mal» sobre un estado perfectamente normal, y cuando todo está
 * amarillo el amarillo deja de significar nada — justo cuando lo necesitamos
 * para el aviso de datos sintéticos y el de buzón compartido. Un trabajo en
 * curso es información neutra: va en gris, y el que está corriendo se distingue
 * por el punto que late, no por el color.
 */

const TEXTO_CORRIDA: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: 'en cola', clase: '' },
  corriendo: { texto: 'buscando', clase: 'pildora--acento' },
  completada: { texto: 'lista', clase: 'pildora--exito' },
  fallida: { texto: 'falló', clase: 'pildora--riesgo' },
  cancelada: { texto: 'cancelada', clase: '' },
};

export function EstadoCorridaPildora({ estado }: { estado: string }) {
  const e = TEXTO_CORRIDA[estado] ?? { texto: estado, clase: '' };
  return (
    <span className={`pildora ${e.clase}`}>
      {estado === 'corriendo' && <span className="punto punto--late" />}
      {e.texto}
    </span>
  );
}

/**
 * Entregabilidad del email.
 *
 * `catch_all` va en amarillo y no en verde a propósito: es la decisión del jefe
 * de saltarlos. Que se vea distinto evita que alguien piense que es aprobable.
 */
const TEXTO_VERIFICACION: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: 'sin verificar', clase: '' },
  verificado: { texto: 'verificado', clase: 'pildora--exito' },
  catch_all: { texto: 'catch-all', clase: 'pildora--alerta' },
  invalido: { texto: 'inválido', clase: 'pildora--riesgo' },
  no_encontrado: { texto: 'no confirmado', clase: 'pildora--alerta' },
};

export function VerificacionPildora({ estado }: { estado: string | null }) {
  if (estado === null) return <span className="apagado">—</span>;
  const e = TEXTO_VERIFICACION[estado] ?? { texto: estado, clase: '' };
  return <span className={`pildora ${e.clase}`}>{e.texto}</span>;
}

/**
 * Estados de la prospección, en castellano.
 *
 * Las claves son los valores reales de `prospecciones.estado` (ver
 * `src/dominio/estados.ts`). Se traducen solo para mostrar: la base sigue
 * guardando el valor interno, y el filtro de /leads sigue mandando el valor
 * interno por la URL. Traducir en la capa de presentación y nada más.
 */
export const ETIQUETA_ESTADO: Record<string, string> = {
  negocio_encontrado: 'Negocio encontrado',
  contacto_encontrado: 'Con correo',
  sin_contacto: 'Sin canal de contacto',
  priorizado: 'Priorizado',
  correo_generado: 'Borrador listo',
  aprobado: 'Aprobado',
  enviado: 'Enviado',
  respondio: 'Respondió',
  descartado_por_humano: 'Descartado',
};

export function etiquetaEstado(estado: string): string {
  return ETIQUETA_ESTADO[estado] ?? estado;
}

/**
 * Estado del correo VIGENTE de un lead (cualquiera menos 'descartado'), para
 * la columna de selección de /leads: si ya hay uno, no se puede generar otro
 * — ver el comentario grande en redaccionService.ts sobre por qué.
 */
export const ETIQUETA_CORREO: Record<string, string> = {
  borrador: 'Borrador pendiente',
  editado: 'Editado, pendiente',
  aprobado: 'Ya aprobado',
  enviado: 'Ya enviado',
};

export function etiquetaCorreo(estado: string): string {
  return ETIQUETA_CORREO[estado] ?? estado;
}

/**
 * Score.
 *
 * Antes tenía tres colores (verde/amarillo/rojo). Ahora el tramo se distingue
 * por PESO y OPACIDAD del texto, no por matiz. Motivo: la tabla se ordena por
 * score, así que la posición ya comunica el ranking; el color solo repetía esa
 * información y a la vez le robaba fuerza al color que sí avisa de un problema.
 * Un lead de score bajo no es un error — es un lead de score bajo.
 */
export function Score({ valor }: { valor: number | null }) {
  if (valor === null) {
    return (
      <span className="score score--nulo" title="sin canal de contacto o sin puntuar">
        —
      </span>
    );
  }
  const clase = valor >= 45 ? 'score--alto' : valor >= 25 ? 'score--medio' : 'score--bajo';
  return <span className={`score ${clase}`}>{valor}</span>;
}
