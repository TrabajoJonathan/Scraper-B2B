-- 005 · correos — el borrador generado por Claude
--
-- ===========================================================================
-- FIX DE ARQUITECTURA (b): el correo cuelga de (prospeccion, contacto).
-- ===========================================================================
--
-- Antes: `correos(negocio_id, ...)`. Dos problemas:
--
-- 1. LA UNIDAD DE ENVIO ES EL EMAIL, NO EL NEGOCIO.
--    En Panama las cadenas tienen N sucursales en Maps compartiendo el mismo
--    info@. Con negocio_id se generaban N borradores distintos al MISMO buzon
--    -> el destinatario recibe 15 correos casi iguales y nos marca como spam.
--    Con contacto_id, el buzon es explicito y el dedup de envio es una consulta
--    trivial (ver vista v_correos_enviables en 007).
--
-- 2. NO SE SABIA QUE PRODUCTO SE OFRECIO.
--    Via prospeccion_id -> busquedas.producto queda gratis, y con ello el
--    historial: "a este buzon ya le ofrecimos web en marzo".

create table if not exists correos (
  id             uuid primary key default gen_random_uuid(),

  -- QUE intento (y por transitividad: que negocio y que producto).
  prospeccion_id uuid not null references prospecciones (id) on delete cascade,
  -- A QUE buzon.
  contacto_id    uuid not null references contactos (id) on delete cascade,

  asunto         text not null,
  cuerpo         text not null,
  cta            text not null,

  -- Trazabilidad: que modelo lo escribio (claude-haiku-4-5, claude-sonnet-5...).
  modelo         text not null,

  estado         text not null default 'borrador'
                 check (estado in ('borrador', 'editado', 'aprobado', 'descartado', 'enviado')),

  creado_en      timestamptz not null default now(),

  -- Un borrador por intento por buzon.
  unique (prospeccion_id, contacto_id)
);

create index if not exists correos_estado_idx  on correos (estado, creado_en desc);
create index if not exists correos_contacto_idx on correos (contacto_id);

comment on table correos is
  'Borrador por (prospeccion x contacto). La unidad de envio es el EMAIL, no el negocio.';

alter table correos enable row level security;
