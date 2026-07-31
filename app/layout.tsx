import './globals.css';
import { Nav } from './componentes/Nav.tsx';
import { usuarioActual } from './lib/usuario.ts';

export const metadata = {
  title: 'Prospección · Codeflow',
  description: 'Herramienta interna de prospección de clientes B2B',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const usuario = usuarioActual();

  return (
    <html lang="es">
      <body>
        <div className="shell">
          <Nav />
          <main className="contenido">
            {/*
              El suplente de autenticación se muestra a propósito. Un registro de
              auditoría con una identidad falsa escondida es peor que no tenerlo:
              alguien lo va a leer en seis meses creyendo que es real.
            */}
            {usuario.esSuplente && (
              <div className="aviso">
                <strong>Sin autenticación.</strong> Estás actuando como{' '}
                <span className="mono">{usuario.email}</span>. Las aprobaciones se van a
                registrar con ese identificador, que <strong>no es una persona real</strong>.
                Se reemplaza al conectar Supabase Auth.
              </div>
            )}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
