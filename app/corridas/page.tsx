import Link from 'next/link';
import { listarCorridas } from '../../src/servicios/corridaService.ts';
import { EstadoCorridaPildora } from '../componentes/Pildoras.tsx';

export const dynamic = 'force-dynamic';

export default async function Corridas() {
  const corridas = await listarCorridas(50);

  return (
    <>
      <h1>Corridas</h1>
      <p className="sub">
        Cada corrida es una búsqueda encargada. El pipeline tarda minutos, así que no
        corre dentro de la petición: se registra y el cron lo va avanzando paso a paso.
      </p>

      <p style={{ marginBottom: '1.5rem' }}>
        <Link href="/corridas/nueva">
          <button>Nueva búsqueda</button>
        </Link>
      </p>

      {corridas.length === 0 ? (
        <p className="apagado">Todavía no hay corridas.</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Buscando</th>
              <th>Estado</th>
              <th>Paso</th>
              <th>Progreso</th>
              <th>Pedida por</th>
            </tr>
          </thead>
          <tbody>
            {corridas.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/corridas/${c.id}`}>{c.producto}</Link></td>
                <td className="apagado">{c.categoria} · {c.ubicacion}</td>
                <td>
                  <EstadoCorridaPildora estado={c.estado} />
                  {c.con_fixtures && (
                    <>
                      {' '}
                      <span
                        className="pildora pildora--alerta"
                        title="Corrió con negocios inventados: faltaban credenciales"
                      >
                        datos de prueba
                      </span>
                    </>
                  )}
                  {c.error !== null && (
                    <span className="razon" title={c.error}>
                      {c.error.slice(0, 60)}
                    </span>
                  )}
                </td>
                <td><span className="mono apagado">{c.paso}</span></td>
                <td className="mono">
                  {c.progreso_total === null
                    ? `${c.progreso_hecho}`
                    : `${c.progreso_hecho}/${c.progreso_total}`}
                </td>
                <td className="apagado mono">{c.creada_por_email ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
