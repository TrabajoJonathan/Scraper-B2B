'use client';

import { useState } from 'react';
import { Check, Pencil, Users, X } from 'lucide-react';
import { accionAprobar, accionDescartar, accionEditar } from '../lib/acciones.ts';
import { Score } from '../componentes/Pildoras.tsx';

type Props = {
  borrador: {
    correoId: string;
    negocio: string;
    email: string;
    asunto: string;
    cuerpo: string;
    cta: string;
    score: number | null;
    razon: string | null;
    comparteBuzonCon: number;
  };
};

/**
 * La columna derecha: el borrador elegido, con forma de correo.
 *
 * Antes esto era una tarjeta más de una pila vertical: el que revisaba tenía que
 * bajar por veinte borradores completos, cada uno con su cuerpo entero y sus
 * tres botones. Dos problemas reales de eso:
 *
 *   · No se podía comparar. Para ver si dos sucursales comparten buzón había que
 *     recordar el correo de la tarjeta que quedó cinco pantallas arriba.
 *   · Los botones se repetían veinte veces, así que «Aprobar» dejaba de leerse
 *     como una decisión y pasaba a ser un botón más del scroll.
 *
 * Con dos columnas la lista completa se ve de un golpe y hay un solo juego de
 * botones en pantalla: el de lo que se está leyendo.
 *
 * `key` desde la página fuerza a React a remontar esto al cambiar de borrador, y
 * por eso el modo edición se cierra solo. Sin eso, abrir la edición de uno y
 * saltar a otro dejaría el textarea con el texto anterior.
 */
export function PanelBorrador({ borrador: b }: Props) {
  const [editando, setEditando] = useState(false);

  return (
    <article className="correo">
      <div className="correo__cabeza">
        <div className="entre" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div className="correo__negocio">{b.negocio}</div>
            <div className="correo__para mono">{b.email}</div>
          </div>
          <Score valor={b.score} />
        </div>

        {b.razon !== null && (
          <p className="correo__razon">
            <span className="label">Por qué está arriba:</span> {b.razon}
          </p>
        )}
      </div>

      {/*
        El aviso del buzón compartido no es decorativo: si dos sucursales comparten
        correo y se aprueban las dos, el destinatario recibe dos mensajes casi
        idénticos y nos marca como spam.
      */}
      {b.comparteBuzonCon > 0 && (
        <div style={{ padding: 'var(--e4) var(--e5) 0' }}>
          <div className="aviso aviso--alerta">
            <Users size={16} strokeWidth={2} />
            <div>
              Este correo lo comparten <strong>{b.comparteBuzonCon + 1} negocios</strong>{' '}
              (sucursales de la misma cadena). Aprobá <strong>uno solo</strong>: si no, la
              misma persona recibe varios mensajes casi iguales.
            </div>
          </div>
        </div>
      )}

      {editando ? (
        <form action={accionEditar}>
          <input type="hidden" name="correoId" value={b.correoId} />
          <div className="correo__cuerpo">
            <div className="campo">
              <label htmlFor={`asunto-${b.correoId}`}>Asunto</label>
              <input
                id={`asunto-${b.correoId}`}
                name="asunto"
                type="text"
                defaultValue={b.asunto}
              />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor={`cuerpo-${b.correoId}`}>Cuerpo</label>
              <textarea id={`cuerpo-${b.correoId}`} name="cuerpo" defaultValue={b.cuerpo} />
            </div>
          </div>
          <div className="correo__pie">
            <button type="submit">
              <Check size={15} strokeWidth={2.5} />
              Guardar cambios
            </button>
            <button type="button" className="secundario" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="correo__asunto-fila">
            <span className="label">Asunto</span>
            <h2 className="correo__asunto">{b.asunto}</h2>
          </div>

          <div className="correo__cuerpo">{b.cuerpo}</div>

          {/*
            Barra de acciones pegada abajo. Un solo botón lleno —Aprobar— y el
            resto con borde o solo texto: el que revisa tiene que ver de una cuál
            es la acción principal sin leer las tres.
          */}
          <div className="correo__pie">
            <form action={accionAprobar}>
              <input type="hidden" name="correoId" value={b.correoId} />
              <button type="submit">
                <Check size={15} strokeWidth={2.5} />
                Aprobar
              </button>
            </form>

            <button type="button" className="secundario" onClick={() => setEditando(true)}>
              <Pencil size={14} strokeWidth={2.25} />
              Editar
            </button>

            <form action={accionDescartar} className="grupo" style={{ marginLeft: 'auto' }}>
              <input type="hidden" name="correoId" value={b.correoId} />
              <input
                name="motivo"
                type="text"
                placeholder="motivo (opcional)"
                aria-label="Motivo del descarte"
                style={{ width: '170px' }}
              />
              <button type="submit" className="peligro">
                <X size={14} strokeWidth={2.25} />
                Descartar
              </button>
            </form>
          </div>

          <p className="correo__nota">
            Aprobar no envía nada: marca el correo como autorizado y queda registrado
            quién lo aprobó. El envío es un paso aparte y todavía no existe.
          </p>
        </>
      )}
    </article>
  );
}
