'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ENLACES = [
  { href: '/', texto: 'Tablero' },
  { href: '/corridas', texto: 'Corridas' },
  { href: '/leads', texto: 'Leads' },
  { href: '/revision', texto: 'Revisión' },
] as const;

export function Nav() {
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
        Alcance v1: Modo 1 sobre Google Maps.
        <br />
        El envío nunca es automático.
      </div>
    </nav>
  );
}
