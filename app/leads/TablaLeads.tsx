'use client';

import { useState } from 'react';
import { Globe, Mail } from 'lucide-react';
import { accionGenerarBorradores } from '../lib/acciones.ts';
import { Score, VerificacionPildora, etiquetaEstado } from '../componentes/Pildoras.tsx';
import type { LeadEnPanel } from '../../src/servicios/panelService.ts';

/**
 * La tabla de leads, con selección múltiple.
 *
 * ===========================================================================
 * Por qué es un componente de cliente, cuando casi todo el panel es servidor
 * ===========================================================================
 *
 * Lo único que necesita estado en el navegador es el contador de "N
 * seleccionados" actualizándose en vivo. El resto — quién se puede seleccionar,
 * qué pasa al enviar — sigue siendo un `<form>` nativo: los checkboxes viajan
 * todos con `name="prospeccionId"`, y `accionGenerarBorradores` los junta con
 * `formData.getAll()`. Sin JavaScript, el formulario funciona igual (se puede
 * tildar y enviar) — solo no se ve el contador ni el resaltado de la fila.
 *
 * Solo hay checkbox en las filas CON correo: no se puede redactar sin un canal
 * de contacto, así que ofrecer la casilla ahí sería un botón que no hace nada.
 */
export function TablaLeads({ leads }: { leads: LeadEnPanel[] }) {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  const seleccionables = leads.filter((l) => l.email !== null);
  const todosMarcados =
    seleccionables.length > 0 && seleccionables.every((l) => seleccionados.has(l.prospeccionId));

  function alternar(id: string) {
    setSeleccionados((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function alternarTodos() {
    setSeleccionados(todosMarcados ? new Set() : new Set(seleccionables.map((l) => l.prospeccionId)));
  }

  return (
    <form action={accionGenerarBorradores}>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr>
              <th style={{ width: '2.25rem' }}>
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos los que tienen correo"
                  checked={todosMarcados}
                  onChange={alternarTodos}
                  disabled={seleccionables.length === 0}
                />
              </th>
              <th style={{ width: '3.5rem' }}>Score</th>
              <th>Negocio</th>
              <th>Correo</th>
              <th style={{ width: '6rem' }}>Reseñas</th>
              <th>Etapa</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const marcado = seleccionados.has(l.prospeccionId);
              return (
                <tr key={l.prospeccionId} className={marcado ? 'fila--marcada' : ''}>
                  <td>
                    {l.email !== null && (
                      <input
                        type="checkbox"
                        name="prospeccionId"
                        value={l.prospeccionId}
                        checked={marcado}
                        onChange={() => alternar(l.prospeccionId)}
                        aria-label={`Seleccionar ${l.negocio}`}
                      />
                    )}
                  </td>

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
              );
            })}
          </tbody>
        </table>
      </div>

      {/*
        Barra flotante: aparece recién cuando hay algo seleccionado, para no
        ocupar espacio permanente por una acción que no siempre se usa. Queda
        pegada abajo (sticky) para no perderla al bajar por una lista larga.
      */}
      {seleccionados.size > 0 && (
        <div className="barra-seleccion">
          <span>
            <strong>{seleccionados.size}</strong>{' '}
            {seleccionados.size === 1 ? 'lead seleccionado' : 'leads seleccionados'}
          </span>
          <button type="submit" className="degradado">
            <Mail size={15} strokeWidth={2.25} />
            Generar borradores
          </button>
        </div>
      )}
    </form>
  );
}
