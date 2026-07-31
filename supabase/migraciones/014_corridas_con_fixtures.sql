-- 014 · corridas.con_fixtures — ¿esta corrida usó datos reales o inventados?
--
-- ===========================================================================
-- Por qué esta columna existe
-- ===========================================================================
--
-- El cron elige automáticamente entre las APIs reales y los fixtures según haya
-- credenciales o no. Eso permite mostrar el sistema funcionando sin llaves, pero
-- crea un riesgo: dentro de un mes nadie va a saber qué corridas trajeron
-- negocios de verdad y cuáles eran de prueba.
--
-- Y esos datos conviven en las mismas tablas. Un lead con score 51 y un correo
-- redactado se ve idéntico venga de donde venga.
--
-- Mismo criterio que con el suplente de autenticación en el panel: si el sistema
-- va a operar con datos falsos, **tiene que decirlo**. Un número inventado que
-- se lee como real es peor que no tener el número.
--
-- La interfaz muestra un aviso cuando esto es true.

alter table corridas
  add column if not exists con_fixtures boolean not null default false;

comment on column corridas.con_fixtures is
  'true = corrio con datos SINTETICOS por falta de credenciales. Sus leads NO son negocios reales.';
