-- 003 · prospecciones — UN INTENTO DE PROSPECCION = (negocio x busqueda)
--
-- ===========================================================================
-- Esta es la tabla que faltaba. Resuelve DOS fixes a la vez.
-- ===========================================================================
--
-- FIX (a) — tabla puente: permite deduplicar negocios sin perder la traza de
--   que busqueda los encontro. Un negocio hallado por tres busquedas = una
--   fila en `negocios` + tres filas aca.
--
-- FIX (c) — aqui vive el ESTADO DE TUBERIA, que antes estaba en
--   `negocios.estado`. Los estados `aprobado` / `enviado` / `respondio`
--   describen un intento de vender UN producto, no una propiedad de la
--   empresa. Como el Modo 1 es "elige un producto de la lista", el mismo
--   negocio se prospecta para varios productos con el tiempo; con el estado
--   en `negocios`, uno marcado `enviado` para el producto A quedaba bloqueado
--   para el producto B.
--
-- Nota sobre los estados: se elimino `nuevo` del roadmap original. Una
-- prospeccion se crea EN el hallazgo, asi que `nuevo` no era alcanzable.
--
-- Se usa text + CHECK en vez de un enum de Postgres a proposito: alterar un
-- enum en produccion es doloroso, y estos estados van a cambiar.

create table if not exists prospecciones (
  id             uuid primary key default gen_random_uuid(),

  negocio_id     uuid not null references negocios (id)  on delete cascade,
  busqueda_id    uuid not null references busquedas (id) on delete cascade,

  estado         text not null default 'negocio_encontrado'
                 check (estado in (
                   'negocio_encontrado',
                   'contacto_encontrado',
                   'sin_contacto',
                   'priorizado',
                   'correo_generado',
                   'aprobado',
                   'enviado',
                   'respondio',
                   'descartado_por_humano'
                 )),

  -- Fase 4: ordena, NO descarta. Sin umbral de corte por diseno.
  score          integer check (score is null or (score >= 0 and score <= 100)),
  -- Transparencia (Via B1): "web profesional · +100 resenas · email corporativo"
  razon          text,

  creada_en      timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),

  -- Un intento por negocio por busqueda. Si la misma busqueda se vuelve a
  -- correr, se actualiza la fila; no se duplica.
  unique (negocio_id, busqueda_id)
);

create index if not exists prospecciones_estado_idx   on prospecciones (estado);
-- Consulta del panel (Fase 6): leads de una busqueda ordenados por score.
create index if not exists prospecciones_busqueda_idx on prospecciones (busqueda_id, score desc nulls last);

create or replace function tocar_actualizada_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizada_en := now();
  return new;
end;
$$;

drop trigger if exists prospecciones_tocar on prospecciones;
create trigger prospecciones_tocar
  before update on prospecciones
  for each row execute function tocar_actualizada_en();

comment on table prospecciones is
  'Un intento de prospeccion = (negocio x busqueda). Tabla puente (fix a) Y sede del estado de tuberia (fix c).';
comment on column prospecciones.estado is
  'POSICION en la tuberia. La entregabilidad del email NO va aqui: vive en contactos.estado_verificacion.';

alter table prospecciones enable row level security;
