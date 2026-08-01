import { ESTADOS_PROSPECCION } from '../../src/dominio/estados.ts';
import { etiquetaEstado } from './Pildoras.tsx';

/**
 * Los leads por etapa, como embudo.
 *
 * Antes esto se mostraba como una tabla de dos columnas («estado | número»).
 * Tres problemas con eso:
 *
 *   1. Una tabla de dos columnas no es una tabla, es una lista con bordes.
 *   2. El orden lo decidía el SQL (`group by`), así que las etapas salían
 *      desordenadas: «aprobado» podía aparecer antes de «negocio_encontrado».
 *      Como son ETAPAS de un proceso, el orden es la mitad de la información.
 *   3. No se veía DÓNDE se cae la gente. Con «120 encontrados / 4 con correo»
 *      el problema está en la extracción de contacto, y eso hay que verlo sin
 *      hacer la resta mentalmente.
 *
 * El orden sale de `ESTADOS_PROSPECCION` (dominio), no de una lista copiada acá:
 * si mañana se agrega una etapa, aparece sola. `app → dominio` es una
 * dependencia hacia abajo, así que respeta la regla de capas.
 *
 * La barra es proporcional al máximo, no al total. Con el total, la primera
 * etapa se come el ancho y las demás quedan como hilos invisibles.
 */
export function Embudo({ conteos }: { conteos: Record<string, number> }) {
  const filas = ESTADOS_PROSPECCION.filter((e) => (conteos[e] ?? 0) > 0).map((e) => ({
    estado: e,
    n: conteos[e] ?? 0,
  }));

  const maximo = Math.max(...filas.map((f) => f.n), 1);

  return (
    <div className="embudo">
      {filas.map((f) => (
        <div
          key={f.estado}
          // `sin_contacto` es lateral, no una etapa más: son los negocios que se
          // quedaron sin canal. Se marca con el acento porque es la fila sobre la
          // que alguien tiene que decidir algo.
          className={`embudo__fila ${f.estado === 'sin_contacto' ? 'embudo__fila--foco' : ''}`}
        >
          <div>
            <div className="embudo__etiqueta">{etiquetaEstado(f.estado)}</div>
            <div className="embudo__pista">
              <div className="embudo__barra" style={{ width: `${(f.n / maximo) * 100}%` }} />
            </div>
          </div>
          <div className="embudo__n">{f.n}</div>
        </div>
      ))}
    </div>
  );
}
