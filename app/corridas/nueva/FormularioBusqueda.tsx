'use client';

import { useActionState } from 'react';
import { accionCrearCorrida, type EstadoAccion } from '../../lib/acciones.ts';

/**
 * Zonas sugeridas de Ciudad de Panamá.
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
            placeholder="Bella Vista, Ciudad de Panamá"
            required
          />
          <datalist id="zonas">
            {ZONAS.map((z) => <option key={z} value={z} />)}
          </datalist>
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
        <p style={{ color: 'var(--riesgo)' }}>{estado.mensaje}</p>
      )}

      <button type="submit" disabled={pendiente}>
        {pendiente ? 'Encargando…' : 'Encargar búsqueda'}
      </button>
    </form>
  );
}
