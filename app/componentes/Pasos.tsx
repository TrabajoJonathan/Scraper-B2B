import { Check, Circle, Loader } from 'lucide-react';
import { PASOS } from '../../src/servicios/corridaService.ts';

/**
 * Los pasos del pipeline, en castellano.
 *
 * Las claves son los valores reales de `corridas.paso`. Igual que con los
 * estados, la base guarda el valor interno y acá solo se traduce para mostrar.
 */
const ETIQUETA_PASO: Record<string, string> = {
  descubrir: 'Descubrir',
  contacto: 'Buscar contacto',
  priorizar: 'Priorizar',
  listo: 'Listo',
};

/**
 * Indicador de pasos.
 *
 * Antes eran seis palabras seguidas separadas por espacios: no se veía cuál era
 * el paso actual sin comparar tonos de gris entre sí. Ahora cada paso lleva un
 * icono que dice su estado por forma, no por color — check para lo hecho, aro
 * girando para el actual, círculo vacío para lo que falta.
 *
 * Importa para la accesibilidad: distinguir por forma y no solo por color es lo
 * que hace que sirva para alguien que no separa bien los grises.
 */
export function Pasos({ pasoActual, estado }: { pasoActual: string; estado: string }) {
  const indice = PASOS.indexOf(pasoActual as never);
  const detenido = estado === 'fallida' || estado === 'cancelada';

  return (
    <ol className="pasos">
      {PASOS.map((paso, i) => {
        const hecho = i < indice;
        const actual = i === indice;

        return (
          <li
            key={paso}
            className={`paso ${hecho ? 'paso--hecho' : actual ? 'paso--actual' : ''}`}
            aria-current={actual ? 'step' : undefined}
          >
            {hecho ? (
              <Check size={13} strokeWidth={2.75} />
            ) : actual && !detenido ? (
              <Loader size={13} strokeWidth={2.5} className="gira" />
            ) : (
              <Circle size={13} strokeWidth={2} />
            )}
            {ETIQUETA_PASO[paso] ?? paso}
          </li>
        );
      })}
    </ol>
  );
}
