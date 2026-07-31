-- 013 · corridas — el trabajo encargado, no ejecutado
--
-- ===========================================================================
-- Por qué existe esta tabla
-- ===========================================================================
--
-- Una corrida completa del pipeline tarda minutos (hasta 8 solo bajando los 60
-- sitios web). Las funciones de Vercel se cortan en decenas de segundos. O sea:
-- el botón "Buscar" NO puede hacer el trabajo. Tiene que **encargarlo**.
--
--   Empleado aprieta "Buscar"  ->  se crea una fila acá (pendiente)
--                              ->  la ruta responde al instante
--   Cron cada minuto           ->  toma la pendiente y avanza UN paso
--   La UI                      ->  lee esta fila y dibuja el progreso
--
-- Esto reutiliza el cron que ya estaba planeado para la Fase 7 en vez de sumar
-- un servicio de colas.
--
-- ===========================================================================
-- Y de regalo: monitoreo (Vía B4) casi gratis
-- ===========================================================================
--
-- Como el error se guarda en la fila, un fallo queda VISIBLE en la interfaz en
-- vez de morir en un log que nadie mira. Eso era un item aparte del roadmap
-- (B4) y sale incluido por diseñarlo así.

create table if not exists corridas (
  id            uuid primary key default gen_random_uuid(),

  -- La búsqueda que esta corrida está procesando. Se crea junto con la corrida.
  busqueda_id   uuid not null references busquedas (id) on delete cascade,

  estado        text not null default 'pendiente'
                check (estado in ('pendiente', 'corriendo', 'completada', 'fallida', 'cancelada')),

  -- En qué paso del pipeline va. Ordenado como las fases.
  paso          text not null default 'descubrir'
                check (paso in ('descubrir', 'contacto', 'verificar', 'priorizar', 'redactar', 'listo')),

  -- Para la barra de progreso. `total` es null mientras no se sepa (antes de
  -- descubrir no sabemos cuántos negocios hay).
  progreso_hecho integer not null default 0,
  progreso_total integer,

  -- Mensaje de error si falló. Visible en la UI, no enterrado en un log.
  error         text,

  -- Quién pidió esta corrida. Sin autenticación todavía: se llena con un
  -- placeholder hasta la Fase 6-auth. Ver `app/lib/usuario.ts`.
  creada_por_email text,

  creada_en     timestamptz not null default now(),
  iniciada_en   timestamptz,
  terminada_en  timestamptz
);

-- La consulta del cron: "dame la corrida pendiente más vieja".
create index if not exists corridas_pendientes_idx
  on corridas (creada_en) where estado in ('pendiente', 'corriendo');

-- La consulta del panel: "las corridas recientes".
create index if not exists corridas_recientes_idx on corridas (creada_en desc);

comment on table corridas is
  'Trabajo encargado. El pipeline no cabe en una peticion de Vercel, asi que el boton encarga y el cron ejecuta.';
comment on column corridas.error is
  'Falla visible en la UI en vez de enterrada en un log. Es monitoreo (Via B4) de regalo.';

alter table corridas enable row level security;
