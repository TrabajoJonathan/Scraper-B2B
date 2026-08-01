import Link from 'next/link';
import { Plus, TriangleAlert } from 'lucide-react';
import { listarCorridas, PASOS } from '../../src/servicios/corridaService.ts';
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

      {corridas.length === 0 ? (
        <p className="tabla__vacia">
          Todavía no hay corridas.
          <br />
          <span style={{ display: 'inline-block', marginTop: 'var(--e4)' }}>
            <Link href="/corridas/nueva" className="boton boton--primario">
              <Plus size={15} strokeWidth={2.5} />
              Encargar la primera
            </Link>
          </span>
        </p>
      ) : (
        <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr>
              <th>Búsqueda</th>
              <th>Estado</th>
              <th>Paso</th>
              <th style={{ width: '150px' }}>Progreso</th>
              <th>Pedida por</th>
            </tr>
          </thead>
          <tbody>
            {corridas.map((c) => (
              <tr key={c.id}>
                {/*
                  Producto y «categoría · ubicación» en una sola celda, en dos
                  renglones. Antes eran dos columnas de igual ancho y el ojo no
                  sabía cuál era el nombre de la corrida. Ahora el producto es lo
                  primario y el resto es metadato: misma información, jerarquía
                  distinta.
                */}
                <td>
                  <Link href={`/corridas/${c.id}`} className="tabla__principal">
                    {c.producto}
                  </Link>
                  <div className="tabla__meta">
                    {c.categoria} · {c.ubicacion}
                  </div>
                  {c.error !== null && (
                    <div className="tabla__meta" style={{ color: 'var(--riesgo)' }} title={c.error}>
                      {c.error.slice(0, 70)}
                    </div>
                  )}
                </td>

                <td>
                  <div className="grupo">
                    <EstadoCorridaPildora estado={c.estado} />
                    {/*
                      El único amarillo que sobrevivió al rediseño en las tablas.
                      No es decoración: si nadie ve esto, un lead inventado se
                      confunde con un negocio real de Panamá.
                    */}
                    {c.con_fixtures && (
                      <span
                        className="pildora pildora--alerta"
                        title="Corrió con negocios inventados: faltaban credenciales"
                      >
                        <TriangleAlert size={11} strokeWidth={2.25} />
                        prueba
                      </span>
                    )}
                  </div>
                </td>

                <td className="tenue mono">{c.paso}</td>

                <td>
                  <Progreso
                    paso={c.paso}
                    hecho={c.progreso_hecho}
                    total={c.progreso_total}
                    estado={c.estado}
                  />
                </td>

                <td className="tenue mono" style={{ fontSize: 'var(--t-micro)' }}>
                  {c.creada_por_email ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </>
  );
}

/**
 * Progreso en línea.
 *
 * Antes la columna decía `3/47` y nada más. Un número sobre otro número obliga a
 * dividir mentalmente para saber si va por la mitad o por el final. La barra
 * responde eso sin leer.
 *
 * Cuando `progreso_total` es null todavía no se sabe el tamaño del trabajo (el
 * paso `descubrir` no sabe cuántos negocios va a traer). En ese caso se cae al
 * avance por PASO, que sí se conoce siempre. Es el mismo cálculo que ya hacía la
 * pantalla de detalle — acá se reutiliza, no se inventa.
 */
function Progreso({
  paso,
  hecho,
  total,
  estado,
}: {
  paso: string;
  hecho: number;
  total: number | null;
  estado: string;
}) {
  const porPaso = Math.round((PASOS.indexOf(paso as never) / (PASOS.length - 1)) * 100);
  const pct = total !== null && total > 0 ? Math.round((hecho / total) * 100) : porPaso;

  return (
    <div className="grupo" style={{ gap: 'var(--e3)' }}>
      <div className="progreso" style={{ flex: 1 }}>
        <div
          className="progreso__barra"
          style={{
            width: `${pct}%`,
            background: estado === 'fallida' ? 'var(--riesgo)' : undefined,
          }}
        />
      </div>
      <span className="mono tenue" style={{ fontSize: 'var(--t-micro)', minWidth: '2.6rem' }}>
        {total === null ? `${hecho}` : `${hecho}/${total}`}
      </span>
    </div>
  );
}
