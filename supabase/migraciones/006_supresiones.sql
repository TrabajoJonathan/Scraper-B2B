-- 006 · supresiones — lista de opt-out / no-contactar
--
-- ===========================================================================
-- FIX DE ARQUITECTURA (d): esto NO es un tema diferido a B6.
-- ===========================================================================
--
-- El diseno original mencionaba "opt-out funcional" en B7 (cumplimiento legal),
-- sin tabla en la Fase 0. El problema es el cron de la Fase 7: vuelve a
-- descubrir los mismos negocios todos los dias. Sin esta tabla, el sistema
-- re-contacta manana a quien se dio de baja ayer — y eso es exactamente el
-- incumplimiento que la Ley 81 sanciona.
--
-- Cuesta una tabla y un check antes de aprobar. Ponerlo ahora es gratis;
-- descubrirlo despues del primer reclamo, no.
--
-- Se suprime por email exacto O por dominio completo (cuando una empresa pide
-- "no contacten a nadie de mi empresa").

create table if not exists supresiones (
  id         uuid primary key default gen_random_uuid(),

  email      text,
  dominio    text,

  motivo     text not null check (motivo in ('opt_out', 'rebote', 'queja', 'manual')),
  nota       text,
  creada_en  timestamptz not null default now(),

  -- Exactamente uno de los dos. Una fila sin ninguno no suprime nada; una con
  -- ambos es ambigua.
  constraint supresion_email_xor_dominio check (
    (email is not null and dominio is null) or
    (email is null and dominio is not null)
  )
);

create unique index if not exists supresiones_email_idx
  on supresiones (lower(email)) where email is not null;
create unique index if not exists supresiones_dominio_idx
  on supresiones (lower(dominio)) where dominio is not null;

comment on table supresiones is
  'Opt-out. Se consulta ANTES de aprobar envio. Sobrevive al re-descubrimiento del cron (Fase 7).';

alter table supresiones enable row level security;
