'use client';

import { useActionState } from 'react';
import { Search } from 'lucide-react';
import { accionCrearCorrida, type EstadoAccion } from '../../lib/acciones.ts';

/**
 * Zonas sugeridas de Ciudad de Panamá — son AUTOCOMPLETADO, no una lista
 * cerrada. El campo de abajo es texto libre (`type="text"`, el `<datalist>`
 * solo ofrece sugerencias): siempre aceptó cualquier zona escrita a mano,
 * incluso antes de esta lista. Lo único que cambió acá es agregar más
 * sugerencias y decirlo explícitamente, para que se note.
 *
 * Se evaluó un autocompletado en vivo estilo Google Maps (Places Autocomplete)
 * y se descartó: es una API DISTINTA de la que ya usamos (Text Search), con
 * cobro propio, y necesitaría exponer la llave en el navegador o un endpoint
 * propio cobrando por cada tecla. Esta lista local es gratis y cubre el mismo
 * caso de uso — sugerir mientras escribís — sin ese costo.
 *
 * Espejo de `ZONAS_CIUDAD_PANAMA` en placesService. No se importa desde ahí a
 * propósito: ese módulo arrastra el cliente de Places (y por lo tanto `pg` y las
 * variables de entorno) al bundle del navegador. Un componente de cliente no
 * debe importar de la capa de servicios.
 */
const ZONAS = [
  'Bella Vista, Ciudad de Panamá',
  'El Cangrejo, Ciudad de Panamá',
  'Obarrio, Ciudad de Panamá',
  'Costa del Este, Ciudad de Panamá',
  'Punta Pacífica, Ciudad de Panamá',
  'San Francisco, Ciudad de Panamá',
  'Casco Antiguo, Ciudad de Panamá',
  'Marbella, Ciudad de Panamá',
  'Paitilla, Ciudad de Panamá',
  'Coco del Mar, Ciudad de Panamá',
  'Betania, Ciudad de Panamá',
  'Parque Lefevre, Ciudad de Panamá',
  'El Dorado, Ciudad de Panamá',
  'Juan Díaz, Ciudad de Panamá',
  'Tocumen, Ciudad de Panamá',
  'Cerro Viento, La Chorrera',
];

export function FormularioBusqueda() {
  const [estado, accion, pendiente] = useActionState<EstadoAccion | null, FormData>(
    accionCrearCorrida,
    null,
  );

  return (
    <form action={accion}>
      <div className="campo">
        <label htmlFor="producto">Producto a vender</label>
        <input
          id="producto"
          name="producto"
          type="text"
          placeholder="sitio web premium con animaciones 3D"
          required
        />
      </div>

      <div className="fila">
        <div className="campo">
          <label htmlFor="categoria">Categoría de negocio a buscar</label>
          <input
            id="categoria"
            name="categoria"
            type="text"
            placeholder="restaurantes"
            required
          />
        </div>

        <div className="campo">
          <label htmlFor="ubicacion">Ubicación</label>
          <input
            id="ubicacion"
            name="ubicacion"
            type="text"
            list="zonas"
            placeholder="Cualquier zona de Panamá (ej. Tocumen, Cerro Viento, El Dorado…)"
            required
          />
          <datalist id="zonas">
            {ZONAS.map((z) => <option key={z} value={z} />)}
          </datalist>
          <p className="tenue" style={{ fontSize: 'var(--t-micro)', marginTop: 'var(--e1)' }}>
            No hace falta que esté en la lista — escribí cualquier zona y listo.
          </p>
        </div>
      </div>

      <div className="campo">
        <label htmlFor="canal">Canal</label>
        <select id="canal" name="canal" defaultValue="google_maps">
          <option value="google_maps">Google Maps</option>
          {/* Vacantes está diseñado pero es un segundo canal, fuera del alcance v1. */}
          <option value="vacantes" disabled>
            Vacantes de empleo (fuera del alcance v1)
          </option>
        </select>
      </div>

      {estado !== null && !estado.ok && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button type="submit" disabled={pendiente} style={{ marginTop: 'var(--e2)' }}>
        <Search size={15} strokeWidth={2.5} />
        {pendiente ? 'Encargando…' : 'Encargar búsqueda'}
      </button>
    </form>
  );
}
