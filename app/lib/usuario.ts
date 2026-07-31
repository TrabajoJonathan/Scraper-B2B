/**
 * ============================================================================
 * SUPLENTE DE AUTENTICACIÓN — se reemplaza por Supabase Auth.
 * ============================================================================
 *
 * `aprobar()` exige un email para la auditoría (la base lo obliga con un CHECK).
 * Mientras no exista login, hace falta algo que poner ahí.
 *
 * DECISIÓN: el suplente se MUESTRA en la interfaz, con un aviso.
 *
 * La alternativa era meter un `'sistema@local'` silencioso, y eso es peor que no
 * tener auditoría: un registro que dice quién aprobó, pero miente, es una
 * trampa. Alguien lo va a leer en seis meses creyendo que es real.
 *
 * Mostrándolo, cualquiera que abra el panel ve que todavía no hay identidad
 * real y no confunde estos registros con los de producción.
 */

/** Se lee de `USUARIO_DEV` en .env; si no está, queda el aviso genérico. */
export function usuarioActual(): { id: string | null; email: string; esSuplente: boolean } {
  const email = process.env['USUARIO_DEV'];
  if (email !== undefined && email.trim() !== '') {
    return { id: null, email: email.trim(), esSuplente: true };
  }
  return { id: null, email: 'sin-autenticar@local', esSuplente: true };
}

/**
 * Qué falta para que esto sea real (Fase 6-auth):
 *
 *  1. Habilitar Supabase Auth y decidir el método (correo corporativo / Google)
 *  2. Reemplazar esta función por la lectura de la sesión de Supabase
 *  3. Escribir las políticas RLS — hoy RLS está activo SIN políticas, o sea la
 *     llave pública está bloqueada. Ese es el default seguro, pero significa que
 *     el panel hoy lee con la llave de servidor.
 *  4. Pasar el uuid real en `usuario.id` para que el FK a `auth.users` sirva
 */
export const PENDIENTE_AUTENTICACION = true;
