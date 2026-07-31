import './globals.css';
import { Nav } from './componentes/Nav.tsx';
import { empleadoActual } from './lib/sesion.ts';
import { accionSalir } from './lib/acciones.ts';

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
      <html lang="es">
        <body>{children}</body>
      </html>
    );
  }

  return (
    <html lang="es">
      <body>
        <div className="shell">
          <Nav emailEmpleado={empleado.email} accionSalir={accionSalir} />
          <main className="contenido">{children}</main>
        </div>
      </body>
    </html>
  );
}
