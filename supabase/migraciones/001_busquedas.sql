-- 001 · busquedas — el "por que" de cada corrida (Via B1: trazabilidad)
--
-- Guarda el searchSpec con el que se lanzo la corrida. Permite repetir una
-- busqueda sin confundir resultados y saber, meses despues, por que este
-- negocio esta en la base.
--
-- La costura Modo 1 / Modo 2 vive en `fuente`: el pipeline consume la misma
-- fila sin importar si la categoria la puso la lista del jefe o el cerebro.

create table if not exists busquedas (
  id          uuid primary key default gen_random_uuid(),

  producto    text not null,
  categoria   text not null,
  ubicacion   text not null,
  canal       text not null check (canal in ('google_maps', 'vacantes')),

  -- Quien lleno el searchSpec. Lo unico que distingue Modo 1 de Modo 2.
  fuente      text not null check (fuente in ('lista_jefe', 'cerebro')),

  creada_en   timestamptz not null default now()
);

-- Consulta tipica: "¿que corri para el producto X ultimamente?"
create index if not exists busquedas_producto_idx on busquedas (producto, creada_en desc);

comment on table busquedas is
  'Metadata de cada corrida del pipeline (searchSpec). Via B1: trazabilidad.';
comment on column busquedas.fuente is
  'lista_jefe = Modo 1; cerebro = Modo 2 (Claude razono la categoria). El pipeline es ciego a esto.';

-- RLS activo sin politicas: la clave service_role (scripts, cron) pasa; la
-- clave anon queda bloqueada. Las politicas del panel se agregan en la Fase 6.
alter table busquedas enable row level security;
