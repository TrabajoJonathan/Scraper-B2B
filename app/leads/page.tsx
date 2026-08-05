import { Search } from 'lucide-react';
import {
  listarLeads,
  conteoPorEstado,
  ORDENES_LEADS,
  type FiltrosLeads,
  type OrdenLeads,
} from '../../src/servicios/panelService.ts';
import { etiquetaEstado } from '../componentes/Pildoras.tsx';
import { TablaLeads } from './TablaLeads.tsx';

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
  // `includes` sobre el arreglo cerrado es la validación: un valor de la URL
  // que no sea ninguno de los cinco órdenes conocidos cae al default, nunca
  // llega a formar parte de una consulta.
  const orden = ORDENES_LEADS.includes(sp['orden'] as OrdenLeads) ? (sp['orden'] as OrdenLeads) : undefined;
  const filtros: FiltrosLeads = {
    ...(sp['busqueda'] !== undefined ? { busquedaId: sp['busqueda'] } : {}),
    ...(sp['estado'] !== undefined && sp['estado'] !== '' ? { estado: sp['estado'] } : {}),
    ...(email === 'con' || email === 'sin' ? { email } : {}),
    ...(sp['texto'] !== undefined && sp['texto'] !== '' ? { texto: sp['texto'] } : {}),
    ...(orden !== undefined ? { orden } : {}),
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
        Por defecto, ordenados por score — es el orden que importa para decidir a quién
        escribir primero. <strong>Nadie se descarta</strong>: los que no tienen canal de
        contacto quedan igual en la lista, marcados, para poder revisarlos.
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

        {/*
          Orden aparte de filtro, a propósito: filtrar reduce la lista, ordenar
          solo la reorganiza. Mezclarlos en un solo control confundiría "no
          quiero ver esto" con "quiero ver esto último".

          Reseñas y estrellas dicen qué tan establecido está un negocio — algo
          distinto de qué tan buen prospecto es (eso ya lo dice el score, y
          para eso ordena por defecto). No hay umbrales fijos (100+, 300+): se
          ordena, no se recorta la lista.
        */}
        <select
          id="orden"
          name="orden"
          aria-label="Ordenar por"
          defaultValue={sp['orden'] ?? 'score'}
          className="select-auto"
        >
          <option value="score">Score (por defecto)</option>
          <option value="resenas_desc">Más reseñas primero</option>
          <option value="resenas_asc">Menos reseñas primero</option>
          <option value="rating_desc">Más estrellas primero</option>
          <option value="rating_asc">Menos estrellas primero</option>
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

          <TablaLeads leads={leads} />
        </>
      )}
    </>
  );
}
