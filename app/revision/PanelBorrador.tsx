'use client';

import { useState } from 'react';
import { Camera, Check, Link2, MessageCircle, Pencil, Phone, Users, X } from 'lucide-react';
import { accionAprobar, accionDescartar, accionEditar } from '../lib/acciones.ts';
import { Score, VerificacionPildora } from '../componentes/Pildoras.tsx';

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
    estadoVerificacion: string;
    producto: string;
    telefono: string | null;
    redes: Record<string, string> | null;
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

  // Solo se muestra un canal cuando hay un DATO REAL detrás — nunca se infiere
  // WhatsApp a partir del teléfono. Ver el comentario grande más abajo.
  //
  // lucide-react no tiene íconos de marca (ni Instagram ni Facebook): Cámara y
  // Link2 son los que más se acercan de su set genérico. No es ideal, pero es
  // mejor que agregar una librería de íconos nueva solo para dos logos.
  const canales = [
    b.telefono !== null && {
      icono: Phone, etiqueta: 'Teléfono', texto: b.telefono, href: `tel:${b.telefono}`,
    },
    b.redes?.whatsapp !== undefined && {
      icono: MessageCircle, etiqueta: 'WhatsApp', texto: b.redes.whatsapp, href: b.redes.whatsapp,
    },
    b.redes?.instagram !== undefined && {
      icono: Camera, etiqueta: 'Instagram', texto: b.redes.instagram, href: b.redes.instagram,
    },
    b.redes?.facebook !== undefined && {
      icono: Link2, etiqueta: 'Facebook', texto: b.redes.facebook, href: b.redes.facebook,
    },
  ].filter(
    (c): c is { icono: typeof Phone; etiqueta: string; texto: string; href: string } => c !== false,
  );

  return (
    <article className="correo">
      <div className="correo__cabeza">
        <div className="entre" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div className="correo__negocio">{b.negocio}</div>
            <div className="correo__para mono">{b.email}</div>
            <p className="tenue" style={{ fontSize: 'var(--t-micro)', margin: '2px 0 0' }}>
              {b.producto}
            </p>
          </div>
          <div style={{ textAlign: 'right', flex: 'none' }}>
            <Score valor={b.score} />
            <div style={{ marginTop: 'var(--e1)' }}>
              <VerificacionPildora estado={b.estadoVerificacion} />
            </div>
          </div>
        </div>

        {b.razon !== null && (
          <p className="correo__razon">
            <span className="label">Por qué está arriba:</span> {b.razon}
          </p>
        )}

        {/*
          Otros canales, aparte del correo. El objetivo es conseguir clientes,
          no solo mandar correos: un negocio con Instagram o teléfono sigue
          siendo un lead útil aunque el email sea lo único que se pueda
          verificar. Cada fila es un dato REAL que se encontró (el teléfono
          viene de Google Maps; Instagram/Facebook/WhatsApp, de un link real en
          el sitio del negocio) — nunca una suposición. Por eso no dice
          "posible WhatsApp": si no hay un link de WhatsApp confirmado,
          simplemente no aparece esa fila.
        */}
        {canales.length > 0 && (
          <div className="canales">
            {canales.map((c) => (
              <a
                key={c.etiqueta}
                href={c.href}
                target={c.href.startsWith('tel:') ? undefined : '_blank'}
                rel={c.href.startsWith('tel:') ? undefined : 'noopener noreferrer'}
                className="canales__item"
                title={c.etiqueta}
              >
                <c.icono size={13} strokeWidth={2} />
                {c.texto}
              </a>
            ))}
          </div>
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
