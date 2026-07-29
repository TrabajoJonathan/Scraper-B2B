-- 010 · contactos: metadata de la verificación (Fase 3)
--
-- Dos columnas que el verificador devuelve gratis en la misma llamada. Si no se
-- guardan ahora, recuperarlas después cuesta volver a pagar la verificación.
--
-- ---------------------------------------------------------------------------
-- verificado_en — CUÁNDO se verificó
-- ---------------------------------------------------------------------------
-- Sin esto, `estado_verificacion = 'verificado'` no dice nada: un email
-- verificado hace 6 meses puede estar muerto (la persona se fue, el dominio
-- expiró). Con la fecha se puede pedir "re-verificar lo que tenga más de N días
-- antes de la campaña", que es la práctica normal para no quemar el dominio.
--
-- ---------------------------------------------------------------------------
-- es_rol — ¿es un buzón de rol (info@, ventas@) o de una persona?
-- ---------------------------------------------------------------------------
-- Importa por dos razones distintas:
--
--  1. LEGAL. Un buzón de rol es mucho menos "dato personal" que
--     juan.perez@empresa.com: no identifica a un individuo. Bajo la Ley 81 eso
--     fortalece la postura de interés legítimo B2B. Poder demostrar "el 90% de
--     nuestra base son buzones de rol" es un argumento concreto, no una opinión.
--
--  2. OPERATIVO. El diseño ya asumía que el contacto "suele ser un buzón
--     genérico". Esto lo convierte en un número medible en vez de una suposición.
--
-- Nullable a propósito: null = todavía no se verificó, así que no se sabe.
-- Distinto de false, que significa "se verificó y es de una persona".

alter table contactos
  add column if not exists verificado_en timestamptz,
  add column if not exists es_rol        boolean;

comment on column contactos.verificado_en is
  'Cuando se corrio el verificador. Sin esto, "verificado" no dice si el dato sigue vigente.';
comment on column contactos.es_rol is
  'true = buzon de rol (info@, ventas@); false = de una persona; null = sin verificar. Argumento legal bajo Ley 81.';

-- Para la consulta "¿qué hay que re-verificar antes de la campaña?"
create index if not exists contactos_verificado_en_idx
  on contactos (verificado_en nulls first) where email is not null;
