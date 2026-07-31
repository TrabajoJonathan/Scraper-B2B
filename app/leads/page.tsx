import {
  listarLeads,
  conteoPorEstado,
  type FiltrosLeads,
} from '../../src/servicios/panelService.ts';
import { Score, VerificacionPildora } from '../componentes/Pildoras.tsx';

export const dynamic = 'force-dynamic';

/**
 * Los filtros viven en la URL, no en estado de React.
 *
 * Ventaja concreta: un empleado puede mandarle a otro el enlace de «los leads sin
 * correo de esta búsqueda» y el otro ve exactamente lo mismo. Con estado en el
 * cliente eso no se puede compartir, y además haría falta JavaScript para algo
 * que el navegador ya sabe hacer con un formulario GET.
 */
export default async function Leads({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  // Se extrae a variable en vez de comparar dentro del spread: TypeScript no
  // conserva el narrowing a través de un spread condicional.
  const email = sp['email'];
  const filtros: FiltrosLeads = {
    ...(sp['busqueda'] !== undefined ? { busquedaId: sp['busqueda'] } : {}),
    ...(sp['estado'] !== undefined && sp['estado'] !== '' ? { estado: sp['estado'] } : {}),
    ...(email === 'con' || email === 'sin' ? { email } : {}),
    ...(sp['texto'] !== undefined && sp['texto'] !== '' ? { texto: sp['texto'] } : {}),
    limite: 200,
  };

  const [leads, estados] = await Promise.all([
    listarLeads(filtros),
    conteoPorEstado(sp['busqueda']),
  ]);

  return (
    <>
      <h1>Leads</h1>
      <p className="sub">
        Ordenados por score. <strong>Nadie se descarta</strong>: los que no tienen canal
        de contacto quedan igual en la lista, marcados, para poder revisarlos.
      </p>

      {/* GET normal: los filtros terminan en la URL y el enlace se puede compartir. */}
      <form className="fila" style={{ marginBottom: '1.5rem' }}>
        {sp['busqueda'] !== undefined && (
          <input type="hidden" name="busqueda" value={sp['busqueda']} />
        )}
        <div>
          <label htmlFor="texto">Buscar por nombre</label>
          <input id="texto" name="texto" type="text" defaultValue={sp['texto'] ?? ''} />
        </div>
        <div>
          <label htmlFor="estado">Estado</label>
          <select id="estado" name="estado" defaultValue={sp['estado'] ?? ''}>
            <option value="">todos</option>
            {Object.entries(estados).map(([e, n]) => (
              <option key={e} value={e}>{e} ({n})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="email">Correo</label>
          <select id="email" name="email" defaultValue={sp['email'] ?? ''}>
            <option value="">todos</option>
            <option value="con">con correo</option>
            <option value="sin">sin correo</option>
          </select>
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <button type="submit">Filtrar</button>
        </div>
      </form>

      {leads.length === 0 ? (
        <p className="tabla__vacia">
          Ningún lead con esos filtros. Si nunca corriste una búsqueda, empezá por Corridas.
        </p>
      ) : (
        <>
          <p className="apagado mono" style={{ marginBottom: '.5rem' }}>
            {leads.length} lead(s)
          </p>
          <table className="tabla">
            <thead>
              <tr>
                <th style={{ width: '3rem' }}>Score</th>
                <th>Negocio</th>
                <th>Correo</th>
                <th>Reseñas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.prospeccionId}>
                  <td><Score valor={l.score} /></td>
                  <td>
                    <strong>{l.negocio}</strong>
                    {l.razon !== null && <span className="razon">{l.razon}</span>}
                    {l.sitioWeb === null && (
                      <span className="razon" style={{ color: 'var(--alerta)' }}>
                        sin sitio web
                      </span>
                    )}
                  </td>
                  <td>
                    {l.email === null ? (
                      <span className="apagado">—</span>
                    ) : (
                      <>
                        <span className="mono" style={{ fontSize: '.8rem' }}>{l.email}</span>
                        <br />
                        <VerificacionPildora estado={l.estadoVerificacion} />
                      </>
                    )}
                  </td>
                  <td className="mono apagado">
                    {l.numResenas ?? '—'}
                    {l.rating !== null && ` · ${l.rating}★`}
                  </td>
                  <td><span className="mono apagado" style={{ fontSize: '.78rem' }}>{l.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
