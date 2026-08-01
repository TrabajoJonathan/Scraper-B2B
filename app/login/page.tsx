import { Radar } from 'lucide-react';
import { FormularioLogin } from './FormularioLogin.tsx';

/**
 * El login. No tiene el layout del panel (ni navegación ni contadores) porque
 * quien está acá todavía no tiene permiso de ver nada de eso.
 *
 * No hay registro público a propósito: es una herramienta interna. Las cuentas
 * se crean desde el panel de Supabase (Authentication → Users → Add user).
 *
 * ---------------------------------------------------------------------------
 * Bloque de marca: el ícono va en un tile, no suelto
 * ---------------------------------------------------------------------------
 * Es el mismo `Radar` que usa el sidebar, a propósito: el login y el panel
 * comparten la marca, así que entrar no se siente como cambiar de aplicación.
 * Es un tile de degradado y no un logo de verdad — sirve de puente hasta que
 * haya uno, igual que la casita azul de OMEGA.
 *
 * Y el nombre dice «CodeFlow» porque es el que hay. La empresa se renombró y el
 * nombre nuevo todavía no llegó; cuando llegue, se cambia acá y en Nav.tsx.
 */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  return (
    <div className="entrada">
      <div className="tarjeta-auth">
        <div className="marca">
          <div className="marca__tile">
            <Radar size={26} strokeWidth={2.25} />
          </div>
          <h1 className="marca__nombre">CodeFlow</h1>
          <p className="marca__bajada">Plataforma de Prospección B2B</p>
        </div>

        <FormularioLogin volver={sp['volver'] ?? '/'} />

        <p className="auth__pie">
          Acceso restringido a empleados autorizados.
          <br />
          No hay registro abierto: las cuentas se crean a pedido.
        </p>
      </div>
    </div>
  );
}
