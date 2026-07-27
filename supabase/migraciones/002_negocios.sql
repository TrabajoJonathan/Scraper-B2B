-- 002 · negocios — LA EMPRESA
--
-- ===========================================================================
-- FIX DE ARQUITECTURA (a): esta tabla ya NO tiene busqueda_id.
-- ===========================================================================
--
-- El diseno original tenia `negocios(busqueda_id, ...)`: un solo FK a
-- busquedas. Eso era incompatible con el dedup que el propio roadmap pedia
-- ("mismo negocio por dos busquedas", Fase 3). Con un FK unico, si dos
-- busquedas encontraban el mismo negocio solo habia dos salidas:
--   - crear dos filas  -> el dedup falla y le escribes dos veces
--   - guardar una fila -> queda apuntando a la primera busqueda y pierdes la
--                         traza de la segunda (rompe Via B1)
--
-- Ahora: una fila por empresa. El vinculo negocio<->busqueda vive en
-- `prospecciones` (003), que ademas es donde va el estado de tuberia.
--
-- ---------------------------------------------------------------------------
-- Sobre "dedup por dominio + nombre normalizado" (roadmap, Fase 1)
-- ---------------------------------------------------------------------------
-- Esa regla, tal cual, colapsa sucursales legitimas: las cadenas panamenas
-- tienen N locales en Maps con el MISMO dominio y el MISMO nombre. Son
-- negocios distintos (direcciones distintas) y hay que conservarlos.
--
-- Resolucion:
--   - dedup de NEGOCIOS       -> por place_id (unico por local fisico)
--   - dedup de ENVIOS         -> por email, en la capa de contactos/correos
-- El dominio NO es clave de dedup de negocios; es clave de agrupacion de envio.
-- Ver 005_correos.sql.

create table if not exists negocios (
  id                  uuid primary key default gen_random_uuid(),

  -- Clave natural de Google. Identifica un local fisico. Es el dedup real.
  -- Nullable porque en el futuro pueden entrar negocios de otro canal.
  place_id            text unique,

  nombre              text not null,
  -- minusculas, sin acentos, sin sufijos societarios (S.A., Corp, Inc).
  nombre_normalizado  text not null,

  -- Dominio del sitio web. Compartido entre sucursales a proposito.
  dominio             text,
  sitio_web           text,
  telefono            text,
  direccion           text,

  -- Categoria que reporta Places (primaryType). Sirve para verificar que la
  -- busqueda trajo lo que pediamos.
  categoria_google    text,

  -- Campos gratis de Places que alimentan el scoring de la Fase 4.
  rating              numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  num_resenas         integer check (num_resenas is null or num_resenas >= 0),

  -- OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
  estado_negocio      text,

  url_maps            text,
  creado_en           timestamptz not null default now()
);

-- Dedup de respaldo cuando no hay place_id: nombre + direccion.
create index if not exists negocios_nombre_norm_idx on negocios (nombre_normalizado);
-- Agrupacion por dominio (sucursales que comparten buzon).
create index if not exists negocios_dominio_idx on negocios (dominio) where dominio is not null;

comment on table negocios is
  'La empresa. Una fila por local fisico. Dedup por place_id. SIN busqueda_id: ver prospecciones.';
comment on column negocios.dominio is
  'NO es clave de dedup: las sucursales comparten dominio. Es clave de agrupacion de ENVIO.';

alter table negocios enable row level security;
