import Link from 'next/link';
import { resumen, listarCorridas } from '../src/servicios/corridaService.ts';
import { conteoPorEstado } from '../src/servicios/panelService.ts';
import { EstadoCorridaPildora } from './componentes/Pildoras.tsx';

/** Sin caché: el tablero tiene que reflejar lo que el cron acaba de hacer. */
export const dynamic = 'force-dynamic';

export default async function Tablero() {
  const [r, corridas, estados] = await Promise.all([
    resumen(),
    listarCorridas(5),
    conteoPorEstado(),
  ]);

  return (
    <>
      <h1>Tablero</h1>
      <p className="sub">
        Estado general de la prospección. El envío nunca es automático: los correos
        aprobados esperan a que se configure el dominio de envío.
      </p>

      <div className="tarjetas">
        <Contador valor={r.negocios} etiqueta="negocios" />
        <Contador valor={r.conEmail} etiqueta="con correo" />
        <Contador valor={r.verificados} etiqueta="verificados" />
        <Contador valor={r.borradoresPendientes} etiqueta="por revisar" />
        <Contador valor={r.aprobados} etiqueta="aprobados" />
        <Contador valor={r.corridasActivas} etiqueta="corridas activas" />
      </div>

      <h2>Leads por estado</h2>
      {Object.keys(estados).length === 0 ? (
        <p className="apagado">
          Todavía no hay leads. <Link href="/corridas/nueva">Empezá una búsqueda</Link>.
        </p>
      ) : (
        <table className="tabla">
          <thead>
            <tr><th>Estado</th><th>Leads</th></tr>
          </thead>
          <tbody>
            {Object.entries(estados).map(([estado, n]) => (
              <tr key={estado}>
                <td><span className="mono">{estado}</span></td>
                <td className="score">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Últimas corridas</h2>
      {corridas.length === 0 ? (
        <p className="apagado">
          Ninguna todavía. <Link href="/corridas/nueva">Crear la primera</Link>.
        </p>
      ) : (
        <table className="tabla">
          <thead>
            <tr><th>Producto</th><th>Buscando</th><th>Estado</th><th>Paso</th></tr>
          </thead>
          <tbody>
            {corridas.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/corridas/${c.id}`}>{c.producto}</Link></td>
                <td className="apagado">{c.categoria} · {c.ubicacion}</td>
                <td><EstadoCorridaPildora estado={c.estado} /></td>
                <td><span className="mono apagado">{c.paso}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Contador({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="tarjeta">
      <div className="tarjeta__valor">{valor}</div>
      <div className="tarjeta__etiqueta">{etiqueta}</div>
    </div>
  );
}
