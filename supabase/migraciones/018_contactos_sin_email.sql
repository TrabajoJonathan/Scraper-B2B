-- 018 · contactos: permite una fila SIN email, para no perder redes/teléfono
--
-- ===========================================================================
-- El bug que esto arregla
-- ===========================================================================
--
-- `registrarContacto()` solo insertaba en `contactos` cuando `contacto.email`
-- no era null. Si un negocio tenía sitio web con Instagram/Facebook/WhatsApp
-- linkeados pero SIN email visible (el caso típico de "solo formulario de
-- contacto"), `extraerContacto()` SÍ encontraba esas redes -- pero
-- `registrarContacto()` las descartaba enteras, porque el único INSERT vivía
-- adentro del `if (contacto.email !== null)`.
--
-- Consecuencia: la prospección quedaba en `sin_contacto` (correcto, sin
-- email), pero el Instagram que el sistema SÍ había encontrado se perdía sin
-- dejar rastro -- justo el caso donde un empleado querría poder escribirle por
-- otro canal.
--
-- ===========================================================================
-- Por qué hace falta un índice nuevo, y no alcanza con el `unique` que ya hay
-- ===========================================================================
--
-- La tabla ya tiene `unique (negocio_id, email)`. Sirve para el `on conflict`
-- cuando SÍ hay email -- pero en Postgres, dos NULL nunca son iguales entre sí
-- para un UNIQUE normal, así que ese `unique` no evita (ni permite resolver
-- con ON CONFLICT) que se creen dos filas con `email = null` para el mismo
-- negocio. Sin este índice, cada re-extracción de un sitio sin email
-- insertaría una fila nueva en vez de actualizar la que ya existía.
--
-- Un índice único PARCIAL (`where email is null`) sí funciona como target de
-- `ON CONFLICT`, y solo aplica a las filas que de verdad lo necesitan.

create unique index if not exists contactos_negocio_sin_email_idx
  on contactos (negocio_id)
  where email is null;

comment on index contactos_negocio_sin_email_idx is
  'Como mucho una fila de contacto SIN email por negocio -- para poder ON CONFLICT cuando solo hay redes/telefono y ningun correo.';
