import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requerido, opcional } from '../../src/core/config.ts';

/**
 * Sesión del empleado. Reemplaza al suplente de `usuario.ts`.
 *
 * ===========================================================================
 * Se usa la llave PÚBLICA (`sb_publishable_`), no la de servidor
 * ===========================================================================
 *
 * La llave `sb_secret_` salta RLS y sirve para cualquier cosa: si se usara para
 * autenticar, un token vencido o falso daría igual acceso total. La pública
 * respeta las políticas y solo puede hacer lo que el usuario logueado puede.
 *
 * Va en el servidor de todos modos (nunca llega al navegador), pero usar la de
 * menor privilegio es gratis y evita una clase entera de errores.
 */
export async function clienteConSesion() {
  const almacen = await cookies();

  return createServerClient(
    requerido('SUPABASE_URL'),
    requerido('SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (aGuardar) => {
          try {
            for (const { name, value, options } of aGuardar) {
              almacen.set(name, value, options);
            }
          } catch {
            // Los Server Components no pueden escribir cookies. No es un error:
            // el refresco de sesión lo hace el middleware, que sí puede. Este
            // catch existe para que leer la sesión desde una página no reviente.
          }
        },
      },
    },
  );
}

export type Empleado = { id: string; email: string };

/**
 * El empleado logueado, o null.
 *
 * Usa `getUser()` y no `getSession()` a propósito: `getSession()` lee la cookie
 * sin validarla contra el servidor, así que una cookie manipulada pasaría.
 * `getUser()` verifica el token con Supabase.
 */
export async function empleadoActual(): Promise<Empleado | null> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.auth.getUser();
  if (error !== null || data.user === null) return null;

  const email = data.user.email;
  if (email === undefined) return null;

  return { id: data.user.id, email };
}

/**
 * ¿Este correo tiene permiso de entrar?
 *
 * Supabase permite registro público por defecto, y eso significa que cualquiera
 * con la URL podría crearse una cuenta. Hay dos capas:
 *
 *   1. Apagar el registro público en el panel de Supabase
 *      (Authentication → Sign In / Providers → desactivar "Allow new users to sign up").
 *      Los empleados se crean a mano desde ahí.
 *   2. Esta función: aunque exista una cuenta, si el dominio no está permitido no
 *      entra. Es la capa que controlamos desde el código.
 *
 * Sin `DOMINIO_PERMITIDO` configurado no filtra por dominio — hay que apoyarse en
 * (1). Se avisa en el arranque.
 */
export function dominioPermitido(email: string): boolean {
  const permitido = opcional('DOMINIO_PERMITIDO');
  if (permitido === undefined) return true;
  return email.toLowerCase().endsWith(`@${permitido.toLowerCase()}`);
}

/**
 * Para la auditoría. Ahora sí devuelve una persona real, así que el FK de
 * `correos.aprobado_por` a `auth.users` finalmente sirve para algo.
 */
export async function usuarioParaAuditoria(): Promise<{ id: string; email: string }> {
  const e = await empleadoActual();
  if (e === null) {
    // No debería pasar: el middleware bloquea las rutas sin sesión. Si pasa, es
    // mejor reventar que registrar una aprobación sin autor.
    throw new Error('No hay sesión: no se puede registrar una aprobación sin autor.');
  }
  return e;
}
