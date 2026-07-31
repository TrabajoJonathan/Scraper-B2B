'use client';

import { useState } from 'react';
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

export function TarjetaBorrador({ borrador: b }: Props) {
  const [editando, setEditando] = useState(false);

  return (
    <article className="borrador">
      <div className="borrador__cabeza">
        <div>
          <strong>{b.negocio}</strong>
          <div className="mono apagado" style={{ fontSize: '.82rem' }}>{b.email}</div>
          {b.razon !== null && <span className="razon">{b.razon}</span>}
        </div>
        <Score valor={b.score} />
      </div>

      {/*
        El aviso del buzón compartido no es decorativo: si dos sucursales comparten
        correo y se aprueban las dos, el destinatario recibe dos mensajes casi
        idénticos y nos marca como spam.
      */}
      {b.comparteBuzonCon > 0 && (
        <div className="aviso" style={{ margin: '.8rem 0 0' }}>
          Este correo lo comparten <strong>{b.comparteBuzonCon + 1} negocios</strong>{' '}
          (sucursales de la misma cadena). Aprobá <strong>uno solo</strong>: si no, la
          misma persona recibe varios mensajes casi iguales.
        </div>
      )}

      {editando ? (
        <form action={accionEditar}>
          <input type="hidden" name="correoId" value={b.correoId} />
          <div className="campo" style={{ marginTop: '.9rem' }}>
            <label htmlFor={`asunto-${b.correoId}`}>Asunto</label>
            <input
              id={`asunto-${b.correoId}`}
              name="asunto"
              type="text"
              defaultValue={b.asunto}
            />
          </div>
          <div className="campo">
            <label htmlFor={`cuerpo-${b.correoId}`}>Cuerpo</label>
            <textarea id={`cuerpo-${b.correoId}`} name="cuerpo" defaultValue={b.cuerpo} />
          </div>
          <div className="borrador__acciones">
            <button type="submit">Guardar cambios</button>
            <button type="button" className="secundario" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="borrador__asunto">{b.asunto}</div>
          <div className="borrador__cuerpo">{b.cuerpo}</div>

          <div className="borrador__acciones">
            <form action={accionAprobar}>
              <input type="hidden" name="correoId" value={b.correoId} />
              <button type="submit">Aprobar</button>
            </form>

            <button type="button" className="secundario" onClick={() => setEditando(true)}>
              Editar
            </button>

            <form action={accionDescartar}>
              <input type="hidden" name="correoId" value={b.correoId} />
              <input
                name="motivo"
                type="text"
                placeholder="motivo (opcional)"
                style={{ width: '190px', display: 'inline-block' }}
              />
              <button type="submit" className="peligro">Descartar</button>
            </form>
          </div>

          <p className="apagado" style={{ fontSize: '.78rem', marginTop: '.7rem' }}>
            Aprobar no envía nada: marca el correo como autorizado y queda registrado
            quién lo aprobó. El envío es un paso aparte y todavía no existe.
          </p>
        </>
      )}
    </article>
  );
}
