import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obtenerCorrida, PASOS } from '../../../src/servicios/corridaService.ts';
import { conteoPorEstado } from '../../../src/servicios/panelService.ts';
import { EstadoCorridaPildora } from '../../componentes/Pildoras.tsx';

export const dynamic = 'force-dynamic';

export default async function DetalleCorrida({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const corrida = await obtenerCorrida(id);
  if (corrida === null) notFound();

  const estados = await conteoPorEstado(corrida.busqueda_id);
  const enCurso = corrida.estado === 'pendiente' || corrida.estado === 'corriendo';

  const indiceActual = PASOS.indexOf(corrida.paso);
  const porcentaje =
    corrida.progreso_total !== null && corrida.progreso_total > 0
      ? Math.round((corrida.progreso_hecho / corrida.progreso_total) * 100)
      : Math.round((indiceActual / (PASOS.length - 1)) * 100);

  return (
    <>
      {/*
        Recarga automática mientras el trabajo está en curso. Es la solución más
        simple que funciona: sin websockets, sin estado en el cliente. Cuando la
        corrida termina, el meta desaparece y la página deja de recargarse.
      */}
      {enCurso && <meta httpEquiv="refresh" content="5" />}

      <h1>{corrida.producto}</h1>
      <p className="sub">
        Buscando <strong>{corrida.categoria}</strong> en <strong>{corrida.ubicacion}</strong>
        {' · '}<EstadoCorridaPildora estado={corrida.estado} />
      </p>

      {corrida.error !== null && (
        <div className="aviso" style={{ borderColor: 'var(--riesgo)', color: '#fbd2d2' }}>
          <strong>Falló:</strong> <span className="mono">{corrida.error}</span>
        </div>
      )}

      <div className="progreso">
        <div className="progreso__barra" style={{ width: `${porcentaje}%` }} />
      </div>

      <div className="pasos">
        {PASOS.map((paso, i) => (
          <span
            key={paso}
            className={`paso ${
              i < indiceActual ? 'paso--hecho' : i === indiceActual ? 'paso--actual' : ''
            }`}
          >
            {paso}
          </span>
        ))}
      </div>

      <p className="apagado mono">
        {corrida.progreso_total === null
          ? `${corrida.progreso_hecho} procesados`
          : `${corrida.progreso_hecho} de ${corrida.progreso_total}`}
        {corrida.creada_por_email !== null && ` · pedida por ${corrida.creada_por_email}`}
      </p>

      {enCurso && (
        <div className="aviso">
          El trabajo lo hace el cron en segundo plano, un paso por vez. Esta página se
          actualiza sola cada 5 segundos.
          <br />
          <span className="apagado">
            El cron todavía no está construido (Fase 7), así que la corrida va a quedarse
            en «en cola» hasta entonces.
          </span>
        </div>
      )}

      <h2>Leads de esta corrida</h2>
      {Object.keys(estados).length === 0 ? (
        <p className="apagado">Todavía no hay leads: el trabajo no arrancó.</p>
      ) : (
        <>
          <table className="tabla">
            <thead><tr><th>Estado</th><th>Leads</th></tr></thead>
            <tbody>
              {Object.entries(estados).map(([estado, n]) => (
                <tr key={estado}>
                  <td className="mono">{estado}</td>
                  <td className="score">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: '1rem' }}>
            <Link href={`/leads?busqueda=${corrida.busqueda_id}`}>
              Ver los leads de esta corrida →
            </Link>
          </p>
        </>
      )}
    </>
  );
}
