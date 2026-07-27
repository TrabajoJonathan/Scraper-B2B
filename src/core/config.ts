/**
 * Carga y valida variables de entorno.
 *
 * Capa: core. No importa nada del proyecto.
 *
 * Regla: cada script pide SOLO las claves que necesita. Asi el Hito 0.5 corre
 * sin tener Supabase todavia, y la Fase 2 no se cae por no tener Apify.
 */

/** Falla con un mensaje que dice exactamente que hacer. */
export function requerido(nombre: string): string {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim() === '') {
    throw new Error(
      `Falta la variable de entorno ${nombre}.\n` +
        `  1. cp .env.example .env\n` +
        `  2. Llenar ${nombre} en .env\n` +
        `  3. Volver a correr (los scripts usan --env-file=.env)`,
    );
  }
  const limpio = valor.trim();

  // Los paneles de Supabase y Google entregan las cadenas con placeholders
  // tipo [YOUR-PASSWORD]. Copiarlas tal cual falla despues con un error de
  // autenticacion que no dice nada. Mejor fallar aca, claro.
  // Cualquier [algo] sobrante: puede ser el placeholder tal cual, o el valor
  // real pegado adentro de los corchetes (que tambien rompe la conexion).
  const placeholder = limpio.match(/\[[^\]\s]+\]/);
  if (placeholder !== null) {
    throw new Error(
      `${nombre} todavia tiene el placeholder ${placeholder[0]} sin reemplazar.\n` +
        `  Editar .env y poner el valor real en lugar de ${placeholder[0]}.`,
    );
  }

  return limpio;
}

export function opcional(nombre: string): string | undefined {
  const valor = process.env[nombre];
  return valor === undefined || valor.trim() === '' ? undefined : valor.trim();
}

/** Para mensajes de arranque: dice que hay configurado sin filtrar secretos. */
export function estadoCredenciales(): Record<string, boolean> {
  return {
    GOOGLE_PLACES_API_KEY: opcional('GOOGLE_PLACES_API_KEY') !== undefined,
    ANTHROPIC_API_KEY: opcional('ANTHROPIC_API_KEY') !== undefined,
    SUPABASE_URL: opcional('SUPABASE_URL') !== undefined,
    SUPABASE_SERVICE_ROLE_KEY: opcional('SUPABASE_SERVICE_ROLE_KEY') !== undefined,
    APIFY_TOKEN: opcional('APIFY_TOKEN') !== undefined,
  };
}
