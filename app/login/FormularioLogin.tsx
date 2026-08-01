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

      {/*
        El error va ARRIBA del formulario, no pegado al botón.
        Al fallar, el foco sigue en el campo de contraseña y el mensaje aparece
        donde ya está mirando el ojo. Abajo del botón queda fuera de vista si la
        tarjeta es alta.
      */}
      {estado !== null && !estado.ok && (
        // `role="alert"` para que un lector de pantalla lo anuncie: si no, el
        // error aparece en silencio y el usuario sigue esperando.
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}

      <div className="campo">
        <label htmlFor="email">Correo electrónico</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="nombre@code-flow-ai.com"
          autoComplete="username"
          required
        />
      </div>

      <div className="campo">
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </div>

      <button
        type="submit"
        className="degradado"
        disabled={pendiente}
        style={{ width: '100%', marginTop: 'var(--e2)' }}
      >
        {pendiente ? 'Entrando…' : 'Iniciar sesión'}
      </button>
    </form>
  );
}
