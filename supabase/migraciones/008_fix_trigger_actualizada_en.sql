-- 008 · fix: el trigger de actualizada_en usaba now()
--
-- Encontrado por `npm run verificar` (39/40).
--
-- EL PROBLEMA
-- `now()` en Postgres devuelve la hora de INICIO DE LA TRANSACCION, no la del
-- momento en que corre la sentencia. O sea: si dentro de una misma transaccion
-- se inserta una prospeccion y luego se actualiza su estado, `actualizada_en`
-- queda igual a `creada_en` y el cambio no deja rastro temporal.
--
-- Eso no es teorico: el cron de la Fase 7 hara exactamente eso — descubrir,
-- guardar, extraer contacto y avanzar el estado, todo en una corrida. Con
-- now() perderiamos la traza de cuando avanzo cada lead.
--
-- LA CORRECCION
-- `clock_timestamp()` devuelve el reloj real en el instante de la sentencia.
--
-- Se reemplaza la funcion (no el trigger): `create or replace function` con la
-- misma firma actualiza el cuerpo, y los triggers que ya la referencian pasan a
-- usar la version nueva sin tocarlos.
--
-- Nota: los DEFAULT de creada_en / actualizada_en se quedan con now(), que es
-- lo correcto para la hora de creacion de la fila.

create or replace function tocar_actualizada_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizada_en := clock_timestamp();
  return new;
end;
$$;

comment on function tocar_actualizada_en() is
  'Usa clock_timestamp(), NO now(): now() es la hora de inicio de la transaccion y no cambia entre sentencias.';
