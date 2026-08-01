import './globals.css';
import { Inter } from 'next/font/google';
import { Nav } from './componentes/Nav.tsx';
import { empleadoActual } from './lib/sesion.ts';
import { accionSalir } from './lib/acciones.ts';

/**
 * Inter, servida por nosotros.
 *
 * `next/font` descarga el archivo en el build y lo sirve desde nuestro propio
 * dominio: no hay pedido a fonts.googleapis.com en tiempo de ejecución. Dos
 * consecuencias que importan acá: no se filtra a Google quién usa la herramienta
 * interna, y no hay salto de fuente al cargar (`display: swap` con la métrica ya
 * conocida).
 *
 * `variable` en vez de `className`: la fuente entra como variable CSS y el
 * `--sans` de globals.css la usa. Así la hoja de estilos sigue siendo la única
 * dueña de la tipografía.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--fuente-inter',
});

export const metadata = {
  title: 'Prospección · herramienta interna',
  description: 'Prospección de clientes B2B',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const empleado = await empleadoActual();

  // Sin sesión el layout no dibuja el panel: quien está acá es alguien en /login,
  // y no tiene permiso de ver ni la navegación ni los contadores.
  if (empleado === null) {
    return (
      <html lang="es" className={inter.variable}>
        <body>{children}</body>
      </html>
    );
  }

  return (
    <html lang="es" className={inter.variable}>
      <body>
        <div className="shell">
          <Nav emailEmpleado={empleado.email} accionSalir={accionSalir} />
          <main className="contenido">{children}</main>
        </div>
      </body>
    </html>
  );
}
