'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Play,
  Users,
  MailCheck,
  Radar,
  LogOut,
  Plus,
} from 'lucide-react';

/**
 * Navegación agrupada por lo que hace el empleado, no por tablas de la base.
 *
 *   TRABAJO → lo que hace en el día: pedir búsquedas, aprobar correos.
 *   DATOS   → lo que consulta: el tablero y la lista de leads.
 *
 * Cuatro enlaces sin agrupar se leen como una lista plana donde todo pesa igual.
 * Con los grupos, la primera vez que alguien entra sabe por dónde empezar.
 *
 * No hay ítems de «Sistema» ni «Configuración»: esas pantallas no existen, y un
 * enlace muerto para rellenar el sidebar es peor que un sidebar corto.
 */
const GRUPOS = [
  {
    titulo: 'Trabajo',
    enlaces: [
      { href: '/corridas', texto: 'Corridas', Icono: Play },
      { href: '/revision', texto: 'Revisión', Icono: MailCheck },
    ],
  },
  {
    titulo: 'Datos',
    enlaces: [
      { href: '/', texto: 'Tablero', Icono: LayoutDashboard },
      { href: '/leads', texto: 'Leads', Icono: Users },
    ],
  },
] as const;

type Props = {
  emailEmpleado: string;
  /** La Server Action de salir, pasada desde el layout. */
  accionSalir: () => Promise<void>;
};

export function Nav({ emailEmpleado, accionSalir }: Props) {
  const ruta = usePathname();

  const activo = (href: string) =>
    href === '/'
      ? ruta === '/'
        ? 'page'
        : undefined
      : ruta.startsWith(href)
        ? 'page'
        : undefined;

  return (
    <nav className="nav">
      <div className="nav__marca">
        <Radar size={17} strokeWidth={2.25} />
        Prospección
      </div>

      {/*
        La acción primaria vive arriba, separada de la navegación. Antes estaba
        enterrada dentro de /corridas: para encargar una búsqueda había que
        adivinar que primero hay que ir a otra pantalla.
      */}
      <div className="nav__accion">
        <Link href="/corridas/nueva" className="boton boton--primario nav__cta">
          <Plus size={15} strokeWidth={2.5} />
          Nueva búsqueda
        </Link>
      </div>

      {GRUPOS.map((g) => (
        <div key={g.titulo} className="nav__grupo">
          <div className="nav__titulo">{g.titulo}</div>
          {g.enlaces.map(({ href, texto, Icono }) => (
            <Link
              key={href}
              href={href}
              className="nav__enlace"
              // `aria-current` marca el activo y además lo usa el CSS: una sola
              // fuente de verdad para accesibilidad y estilo.
              aria-current={activo(href)}
            >
              <Icono size={16} strokeWidth={2} />
              {texto}
            </Link>
          ))}
        </div>
      ))}

      <div className="nav__usuario">
        {/*
          Se muestra quién está logueado porque las aprobaciones se registran a su
          nombre. Si alguien deja la sesión abierta en una máquina compartida y
          otro aprueba, la auditoría va a decir el nombre equivocado — y verlo
          abajo a la izquierda es lo que hace que se note.
        */}
        <div className="nav__perfil">
          <span className="avatar">{emailEmpleado.charAt(0).toUpperCase()}</span>
          <span className="nav__correo">{emailEmpleado}</span>
          <form action={accionSalir}>
            <button type="submit" className="ghost nav__salir" title="Salir">
              <LogOut size={15} strokeWidth={2} />
            </button>
          </form>
        </div>

        <div className="nav__nota">
          v1 · Google Maps
          <br />
          El envío nunca es automático.
        </div>
      </div>
    </nav>
  );
}
