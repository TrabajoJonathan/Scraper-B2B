/**
 * Cliente de Supabase (PostgreSQL).
 *
 * Capa: core.
 *
 * Usa la clave `service_role`, que salta las politicas RLS. Eso esta bien para
 * scripts y crons de servidor, y esta MAL en el panel web de la Fase 6: ahi va
 * la clave `anon` con RLS activo. No mover esta clave al cliente.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { opcional, requerido } from './config.ts';

let cliente: SupabaseClient | undefined;

/**
 * Supabase cambio el formato de llaves: `sb_secret_...` reemplaza al viejo
 * `service_role` (un JWT largo). Aceptamos las dos para no romper proyectos
 * creados antes del cambio; la nueva tiene prioridad.
 */
function llaveDeServidor(): string {
  const nueva = opcional('SUPABASE_SECRET_KEY');
  if (nueva !== undefined) return nueva;
  return requerido('SUPABASE_SERVICE_ROLE_KEY');
}

export function clienteSupabase(): SupabaseClient {
  if (cliente === undefined) {
    cliente = createClient(requerido('SUPABASE_URL'), llaveDeServidor(), {
      auth: { persistSession: false },
    });
  }
  return cliente;
}
