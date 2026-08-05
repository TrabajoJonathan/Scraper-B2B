'use client';

import { useState } from 'react';
import { Camera, Globe, Lock, Link2, Mail, MessageCircle, Phone } from 'lucide-react';
import { accionGenerarBorradores } from '../lib/acciones.ts';
import { Score, VerificacionPildora, etiquetaEstado, etiquetaCorreo } from '../componentes/Pildoras.tsx';
import type { LeadEnPanel } from '../../src/servicios/panelService.ts';

/** ¿Hay algún canal manual — teléfono o una red social con link real? */
function tieneCanalesManuales(lead: LeadEnPanel): boolean {
  return lead.telefono !== null || lead.redes !== null;
}

/**
 * Qué mostrar cuando no hay email, pero sí otro canal.
 *
 * El objetivo es conseguir clientes, no solo mandar correos: un negocio sin
 * correo pero con teléfono o Instagram sigue siendo un lead al que alguien
 * puede escribirle o llamarle a mano. Solo entra un ícono por canal que
 * REALMENTE se encontró — nunca se infiere WhatsApp a partir del teléfono.
 *
 * «Sin canales de contacto» queda reservado para cuando de verdad no se
 * encontró nada — ni email, ni teléfono, ni una red social. Si dijera eso
 * mismo con un Instagram real al lado, sería mentirle al que revisa.
 */
function CanalesLead({ lead }: { lead: LeadEnPanel }) {
  if (!tieneCanalesManuales(lead)) {
    return <span className="tenue" style={{ fontSize: 'var(--t-micro)' }}>Sin canales de contacto</span>;
  }

  return (
    <div className="canales-mini" title="Sin correo, pero se puede contactar por acá">
      {lead.telefono !== null && <Phone size={12} strokeWidth={2} />}
      {lead.redes?.whatsapp !== undefined && <MessageCircle size={12} strokeWidth={2} />}
      {lead.redes?.instagram !== undefined && <Camera size={12} strokeWidth={2} />}
      {lead.redes?.facebook !== undefined && <Link2 size={12} strokeWidth={2} />}
      <span className="tenue" style={{ fontSize: 'var(--t-micro)' }}>sin correo, contactable</span>
    </div>
  );
}

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
 *
 * Tampoco hay checkbox si `estadoCorreo` no es null: ya existe un correo
 * vigente (cualquiera menos descartado) para ese lead. Esto es la ayuda
 * visual, no la regla real — la regla real vive en `generarBorradores()`
 * (redaccionService.ts), que rechaza la regeneración aunque alguien mande el
 * formulario sin pasar por esta pantalla. Si el correo se descarta, el lead
 * vuelve a aparecer seleccionable en la próxima carga, sin que nadie tenga
 * que hacer nada más: es la misma consulta, mirando el mismo estado.
 */
export function TablaLeads({ leads }: { leads: LeadEnPanel[] }) {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  const seleccionables = leads.filter((l) => l.email !== null && l.estadoCorreo === null);
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
              <th>Contacto</th>
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
                    {l.email === null ? null : l.estadoCorreo !== null ? (
                      <span className="tenue" title={etiquetaCorreo(l.estadoCorreo)}>
                        <Lock size={13} strokeWidth={2} />
                      </span>
                    ) : (
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
                      <CanalesLead lead={l} />
                    ) : (
                      <>
                        <div className="mono" style={{ fontSize: 'var(--t-micro)' }}>
                          {l.email}
                        </div>
                        <div className="grupo" style={{ marginTop: '3px', gap: 'var(--e1)' }}>
                          <VerificacionPildora estado={l.estadoVerificacion} />
                          {l.estadoCorreo !== null && (
                            <span className="pildora" title="Ya tiene un correo vigente — no se puede regenerar">
                              {etiquetaCorreo(l.estadoCorreo)}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </td>

                  <td className="mono tenue">
                    {l.numResenas ?? '—'}
                    {l.rating !== null && ` · ${l.rating}★`}
                  </td>

                  {/*
                    "Sin canal de contacto" al lado de un Instagram real en la
                    columna anterior se lee como una contradicción — justo la
                    sensación de "lead muerto" que esto tiene que evitar. Para
                    ese caso puntual (sin_contacto CON algún canal manual) se
                    usa una etiqueta distinta; para todo lo demás, la de
                    siempre.
                  */}
                  <td className="tenue" style={{ fontSize: 'var(--t-micro)' }}>
                    {l.estado === 'sin_contacto' && tieneCanalesManuales(l)
                      ? 'Contacto manual disponible'
                      : etiquetaEstado(l.estado)}
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
