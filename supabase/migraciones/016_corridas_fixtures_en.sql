-- 016 · corridas.fixtures_en — QUÉ parte de la corrida es inventada
--
-- ===========================================================================
-- Por qué el booleano de la 014 ya no alcanza
-- ===========================================================================
--
-- `con_fixtures` responde «¿hay algo inventado acá?». Servía cuando la elección
-- era todo-o-nada: o había las cuatro llaves y todo era real, o faltaba alguna
-- y todo era fixture.
--
-- El 2026-08-02 llegaron las llaves de Places y Anthropic; faltan Apify y
-- MillionVerifier. Desde entonces una corrida puede ser MIXTA: negocios reales
-- de Google Maps, con correos de contacto inventados.
--
-- Y una corrida mixta es MÁS peligrosa que una totalmente falsa, no menos. Con
-- todo inventado, «Restaurante El Fogón Panameño» no existe y nadie se
-- confunde. Con datos mixtos, «Restaurante El Trapiche» SÍ existe, tiene 1729
-- reseñas reales — y el correo que le colgamos al lado es inventado. El dato
-- real le presta credibilidad al falso.
--
-- Así que el aviso de la interfaz tiene que poder decir exactamente qué parte
-- no hay que creerle, y eso no cabe en un booleano.
--
-- Se guarda el texto tal como se le muestra al empleado («los negocios», «los
-- correos de contacto») y no el nombre de la variable de entorno: el que revisa
-- no tiene por qué saber qué es APIFY_TOKEN.
--
-- `con_fixtures` se queda: es la bandera barata para filtrar y sigue siendo la
-- que consulta la interfaz para decidir SI muestra el aviso. Esta columna dice
-- QUÉ pone adentro.

alter table corridas
  add column if not exists fixtures_en text[] not null default '{}';

comment on column corridas.fixtures_en is
  'Que partes salieron de fixture, en lenguaje de empleado. Vacio = corrida enteramente real. Ver con_fixtures para el si/no.';
