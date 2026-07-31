import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * ===========================================================================
 * ESTA ES LA SEGURIDAD REAL DEL PANEL.
 * ===========================================================================
 *
 * Las políticas RLS (migración 015) son la segunda capa: el panel consulta
 * Postgres directo con la contraseña de la base, así que las saltea. Lo que de
 * verdad impide que alguien sin sesión vea datos es este archivo: sin sesión no
 * se llega a ninguna ruta, y por lo tanto no se ejecuta ninguna consulta.
 *
 * Dos trabajos:
 *   1. Refrescar la sesión (los Server Components no pueden escribir cookies;
 *      el middleware sí, así que el refresco tiene que pasar por acá).
 *   2. Redirigir a /login a quien no tenga sesión.
 */

/** Rutas que no exigen sesión. */
const PUBLICAS = ['/login', '/api/cron'];

export async function middleware(peticion: NextRequest) {
  let respuesta = NextResponse.next({ request: peticion });

  const url = process.env['SUPABASE_URL'];
  const llave = process.env['SUPABASE_PUBLISHABLE_KEY'];

  // Sin configuración de Supabase no se puede autenticar a nadie. Falla cerrado:
  // dejar pasar "porque no está configurado" sería exactamente el agujero que
  // este archivo existe para tapar.
  if (url === undefined || llave === undefined) {
    if (esPublica(peticion.nextUrl.pathname)) return respuesta;
    return NextResponse.json(
      { error: 'Falta SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY: el panel queda cerrado.' },
      { status: 500 },
    );
  }

  const supabase = createServerClient(url, llave, {
    cookies: {
      getAll: () => peticion.cookies.getAll(),
      setAll: (aGuardar) => {
        for (const { name, value } of aGuardar) peticion.cookies.set(name, value);
        respuesta = NextResponse.next({ request: peticion });
        for (const { name, value, options } of aGuardar) {
          respuesta.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getUser()` y no `getSession()`: valida el token contra el servidor en vez
  // de confiar en la cookie. Una cookie manipulada no pasa.
  const { data } = await supabase.auth.getUser();
  const logueado = data.user !== null;
  const ruta = peticion.nextUrl.pathname;

  if (!logueado && !esPublica(ruta)) {
    const destino = peticion.nextUrl.clone();
    destino.pathname = '/login';
    // Se recuerda a dónde iba, para volver ahí después de entrar.
    destino.searchParams.set('volver', ruta);
    return NextResponse.redirect(destino);
  }

  // Ya logueado y va a /login: no tiene sentido, al tablero.
  if (logueado && ruta === '/login') {
    const destino = peticion.nextUrl.clone();
    destino.pathname = '/';
    destino.search = '';
    return NextResponse.redirect(destino);
  }

  return respuesta;
}

function esPublica(ruta: string): boolean {
  return PUBLICAS.some((p) => ruta === p || ruta.startsWith(`${p}/`));
}

export const config = {
  /*
   * Corre en todo menos archivos estáticos e imágenes. Se excluyen a mano porque
   * validar la sesión en cada ícono es gasto sin sentido.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css)$).*)'],
};
