'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ENLACES = [
  { href: '/', texto: 'Tablero' },
  { href: '/corridas', texto: 'Corridas' },
  { href: '/leads', texto: 'Leads' },
  { href: '/revision', texto: 'Revisión' },
] as const;

type Props = {
  emailEmpleado: string;
  /** La Server Action de salir, pasada desde el layout. */
  accionSalir: () => Promise<void>;
};

export function Nav({ emailEmpleado, accionSalir }: Props) {
  const ruta = usePathname();

  return (
    <nav className="nav">
      <div className="nav__marca">Prospección</div>
      {ENLACES.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          // `aria-current` marca el activo y además lo usa el CSS: una sola
          // fuente de verdad para accesibilidad y estilo.
          aria-current={
            e.href === '/' ? (ruta === '/' ? 'page' : undefined)
            : ruta.startsWith(e.href) ? 'page' : undefined
          }
        >
          {e.texto}
        </Link>
      ))}

      <div className="nav__pie">
        {/*
          Se muestra quién está logueado porque las aprobaciones se registran a su
          nombre. Si alguien deja la sesión abierta en una máquina compartida y
          otro aprueba, la auditoría va a decir el nombre equivocado — y verlo
          arriba a la izquierda es lo que hace que se note.
        */}
        <div className="mono" style={{ marginBottom: '.5rem', wordBreak: 'break-all' }}>
          {emailEmpleado}
        </div>
        <form action={accionSalir}>
          <button
            type="submit"
            className="secundario"
            style={{ fontSize: '.75rem', padding: '.25rem .6rem' }}
          >
            Salir
          </button>
        </form>
        <div style={{ marginTop: '.75rem' }}>
          Alcance v1: Modo 1 sobre Google Maps.
          <br />
          El envío nunca es automático.
        </div>
      </div>
    </nav>
  );
}
