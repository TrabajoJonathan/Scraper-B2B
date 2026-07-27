-- 004 · contactos — el dato de contacto publico del negocio
--
-- Cuelga del NEGOCIO (no de la prospeccion): el email de una empresa es el
-- mismo sin importar que producto le estemos ofreciendo.
--
-- `estado_verificacion` es el UNICO lugar donde vive la entregabilidad del
-- email (fix de la review v1.1). No duplicarlo en prospecciones.estado: el
-- estado de la prospeccion es POSICION, la calidad del email es del CONTACTO.

create table if not exists contactos (
  id                  uuid primary key default gen_random_uuid(),
  negocio_id          uuid not null references negocios (id) on delete cascade,

  email               text,
  telefono            text,
  -- {"facebook": "...", "instagram": "..."}
  redes               jsonb,

  -- Via B1: de donde salio el dato, para poder evaluar su calidad despues.
  origen_del_correo   text check (origen_del_correo is null or origen_del_correo in (
                        'footer', 'contacto', 'about', 'mailto',
                        'facebook', 'instagram', 'places', 'manual', 'proveedor'
                      )),

  -- 'pendiente' se agrego al modelo del roadmap: hace falta un valor por
  -- defecto para el email que existe pero aun no paso por el verificador.
  estado_verificacion text not null default 'pendiente'
                      check (estado_verificacion in (
                        'pendiente', 'verificado', 'catch_all', 'invalido', 'no_encontrado'
                      )),

  creado_en           timestamptz not null default now(),

  -- El mismo email no se guarda dos veces para el mismo negocio.
  unique (negocio_id, email)
);

-- Clave para el dedup de ENVIO: encontrar todos los negocios que comparten
-- un buzon (el caso de las sucursales con el mismo info@).
create index if not exists contactos_email_idx on contactos (lower(email)) where email is not null;

comment on table contactos is
  'Contacto publico del negocio (sale de su propia web). Suele ser un buzon generico info@/contacto@.';
comment on column contactos.estado_verificacion is
  'UNICA fuente de verdad de la entregabilidad. No replicar en prospecciones.estado.';

alter table contactos enable row level security;
