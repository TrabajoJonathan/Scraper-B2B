import { Radar } from 'lucide-react';
import { FormularioLogin } from './FormularioLogin.tsx';

/**
 * El login. No tiene el layout del panel (ni navegación ni contadores) porque
 * quien está acá todavía no tiene permiso de ver nada de eso.
 *
 * No hay registro público a propósito: es una herramienta interna. Las cuentas
 * se crean desde el panel de Supabase (Authentication → Users → Add user).
 */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  return (
    <div className="login">
      <div className="nav__marca" style={{ padding: '0 0 var(--e6)' }}>
        <Radar size={17} strokeWidth={2.25} />
        Prospección
      </div>

      <h1 style={{ fontSize: 'var(--t-h2)' }}>Entrar</h1>
      <p className="sub">
        Herramienta interna. Si no tenés cuenta, pedila — no hay registro abierto.
      </p>

      <FormularioLogin volver={sp['volver'] ?? '/'} />
    </div>
  );
}
