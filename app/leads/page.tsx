import { Globe, Search } from 'lucide-react';
import {
  listarLeads,
  conteoPorEstado,
  type FiltrosLeads,
} from '../../src/servicios/panelService.ts';
import { Score, VerificacionPildora, etiquetaEstado } from '../componentes/Pildoras.tsx';

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

      {/*
        Barra de filtros.
        --------------------------------------------------------------------
        Sigue siendo un GET normal (los filtros terminan en la URL y el enlace se
        puede compartir). Lo que cambió es la forma: antes eran tres campos
        sueltos del mismo ancho que el contenido, y parecían un formulario de
        carga. Ahora es una barra compacta: los controles miden lo que necesita su
        contenido, el buscador lleva su icono adentro, y el botón queda al final
        de la fila y no debajo.
      */}
      <form className="barra">
        {sp['busqueda'] !== undefined && (
          <input type="hidden" name="busqueda" value={sp['busqueda']} />
        )}

        <div className="busca">
          <Search size={14} strokeWidth={2.25} />
          <input
            id="texto"
            name="texto"
            type="text"
            placeholder="Buscar por nombre…"
            aria-label="Buscar por nombre"
            defaultValue={sp['texto'] ?? ''}
          />
        </div>

        <select
          id="estado"
          name="estado"
          aria-label="Filtrar por etapa"
          defaultValue={sp['estado'] ?? ''}
          className="select-auto"
        >
          <option value="">Todas las etapas</option>
          {Object.entries(estados).map(([e, n]) => (
            <option key={e} value={e}>
              {etiquetaEstado(e)} ({n})
            </option>
          ))}
        </select>

        <select
          id="email"
          name="email"
          aria-label="Filtrar por correo"
          defaultValue={sp['email'] ?? ''}
          className="select-auto"
        >
          <option value="">Con y sin correo</option>
          <option value="con">Solo con correo</option>
          <option value="sin">Solo sin correo</option>
        </select>

        <button type="submit" className="secundario">
          Filtrar
        </button>
      </form>

      {leads.length === 0 ? (
        <p className="tabla__vacia">
          Ningún lead con esos filtros.
          <br />
          Si nunca corriste una búsqueda, empezá por Corridas.
        </p>
      ) : (
        <>
          <p className="tenue" style={{ fontSize: 'var(--t-label)', margin: '0 0 var(--e3)' }}>
            {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
          </p>

          <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th style={{ width: '3.5rem' }}>Score</th>
                <th>Negocio</th>
                <th>Correo</th>
                <th style={{ width: '6rem' }}>Reseñas</th>
                <th>Etapa</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.prospeccionId}>
                  <td>
                    <Score valor={l.score} />
                  </td>

                  {/*
                    Nombre primario, razón del score debajo en chico. La razón es
                    la explicación de POR QUÉ ese lead está arriba — tiene que
                    estar visible sin abrir nada, pero no puede competir con el
                    nombre del negocio.
                  */}
                  <td>
                    <span className="tabla__principal">{l.negocio}</span>
                    {l.razon !== null && <span className="razon">{l.razon}</span>}
                    {l.sitioWeb === null && (
                      <span className="tabla__meta grupo" style={{ gap: 'var(--e1)' }}>
                        <Globe size={11} strokeWidth={2} />
                        sin sitio web
                      </span>
                    )}
                  </td>

                  <td>
                    {l.email === null ? (
                      <span className="tenue">—</span>
                    ) : (
                      <>
                        <div className="mono" style={{ fontSize: 'var(--t-micro)' }}>
                          {l.email}
                        </div>
                        <div style={{ marginTop: '3px' }}>
                          <VerificacionPildora estado={l.estadoVerificacion} />
                        </div>
                      </>
                    )}
                  </td>

                  <td className="mono tenue">
                    {l.numResenas ?? '—'}
                    {l.rating !== null && ` · ${l.rating}★`}
                  </td>

                  <td className="tenue" style={{ fontSize: 'var(--t-micro)' }}>
                    {etiquetaEstado(l.estado)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </>
  );
}
