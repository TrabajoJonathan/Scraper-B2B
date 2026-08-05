import Link from 'next/link';
import { Users } from 'lucide-react';
import { Score } from '../componentes/Pildoras.tsx';

type Item = {
  correoId: string;
  negocio: string;
  email: string;
  score: number | null;
  comparteBuzonCon: number;
  producto: string;
};

/**
 * La columna izquierda: la cola por revisar.
 *
 * Es un componente de servidor y la selección son enlaces normales, no estado de
 * React. Mismo criterio que los filtros de /leads: el correo elegido queda en la
 * URL (`?correo=<id>`), así que se puede compartir «revisá este borrador» y el
 * botón de atrás del navegador funciona.
 */
export function ListaBorradores({
  items,
  seleccionado,
  busquedaId,
}: {
  items: Item[];
  seleccionado: string;
  busquedaId: string | undefined;
}) {
  const enlace = (correoId: string) => {
    const p = new URLSearchParams();
    if (busquedaId !== undefined) p.set('busqueda', busquedaId);
    p.set('correo', correoId);
    return `/revision?${p.toString()}`;
  };

  return (
    <div className="lista">
      {items.map((i) => (
        <Link
          key={i.correoId}
          href={enlace(i.correoId)}
          className="lista__item"
          aria-current={i.correoId === seleccionado}
          // `scroll={false}`: al elegir otro borrador la página no debe saltar
          // arriba. Se está trabajando dentro de una lista, no navegando.
          scroll={false}
        >
          <div className="lista__cabeza">
            <span className="lista__nombre">{i.negocio}</span>
            <Score valor={i.score} />
          </div>
          <div className="lista__meta">{i.email}</div>
          {/*
            El producto: antes sobraba (la cola era de UNA búsqueda, ya se
            sabía). Ahora que puede traer varias búsquedas mezcladas, decir de
            dónde vino cada una es lo que evita confundir "esto es para el
            mismo producto que el anterior" cuando no lo es.
          */}
          <div className="lista__meta tenue" style={{ fontSize: '0.6875rem' }}>
            {i.producto}
          </div>
          {i.comparteBuzonCon > 0 && (
            <div className="lista__marca" title="Buzón compartido con otras sucursales">
              <Users size={11} strokeWidth={2.25} />
              comparte buzón
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
