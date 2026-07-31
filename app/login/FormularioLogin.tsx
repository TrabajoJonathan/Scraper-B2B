'use client';

import { useActionState } from 'react';
import { accionEntrar, type EstadoAccion } from '../lib/acciones.ts';

export function FormularioLogin({ volver }: { volver: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion | null, FormData>(
    accionEntrar,
    null,
  );

  return (
    <form action={accion}>
      <input type="hidden" name="volver" value={volver} />

      <div className="campo">
        <label htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>

      <div className="campo">
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {estado !== null && !estado.ok && (
        <p style={{ color: 'var(--riesgo)', fontSize: '.88rem' }}>{estado.mensaje}</p>
      )}

      <button type="submit" disabled={pendiente} style={{ width: '100%' }}>
        {pendiente ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
