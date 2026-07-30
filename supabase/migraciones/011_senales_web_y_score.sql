-- 011 · señales del sitio web + detalle del score (Fase 4)
--
-- ===========================================================================
-- senales_web — lo que se ve en el sitio del propio negocio
-- ===========================================================================
--
-- ¿Por qué tabla aparte y no columnas en `negocios`?
--
--  1. **Fuente distinta.** `negocios` guarda lo que dijo Google Places. Esto es
--     lo que encontramos entrando a la web del negocio. Mezclarlos haría
--     imposible saber de dónde salió cada dato — y la Vía B1 pide justamente eso.
--  2. **Se re-captura por separado.** Un negocio puede rediseñar su sitio sin
--     cambiar nada en Places. Con `capturado_en` propio se sabe si la señal está
--     vieja, igual que `contactos.verificado_en`.
--
-- Estas señales reemplazan las dos que el jefe pidió pero no se pueden hacer sin
-- scrapear Instagram/Facebook/LinkedIn (riesgo de baneo que él mismo descartó):
--
--   pidió "inversión en ads (Meta Ad Library)"  ->  tiene_pixel_meta / tiene_tag_google
--   pidió "actividad digital reciente (IG/FB)"  ->  anio_copyright + tiene_redes
--
-- Y de paso salen las señales del eje de NECESIDAD, que era lo que le faltaba a
-- su lista: un sitio no responsive o con copyright viejo es un negocio que
-- necesita sitio nuevo. Todo esto sale del MISMO HTML que la Fase 2 ya descarga:
-- cero peticiones extra, cero costo.

create table if not exists senales_web (
  negocio_id        uuid primary key references negocios (id) on delete cascade,

  -- ¿respondió el sitio? false = caído, TLS vencido, timeout.
  respondio         boolean not null default false,

  -- Eje CAPACIDAD: ¿invierte en publicidad? (proxy legal de Meta Ad Library)
  tiene_pixel_meta  boolean,
  tiene_tag_google  boolean,

  -- Eje NECESIDAD: ¿su sitio está viejo o mal hecho?
  -- Año del footer. Si dice 2019, el sitio está abandonado.
  anio_copyright    integer,
  -- Sin <meta viewport> no es responsive: en 2026 eso es un sitio de hace años.
  es_responsive     boolean,
  -- El "sitio" es en realidad un Linktree / página de Facebook / Instagram.
  solo_redes        boolean,

  -- Plataforma detectada (wix, wordpress, shopify, squarespace...). Informativo:
  -- un Wix de plantilla es una necesidad distinta a un WordPress a medida.
  plataforma        text,

  capturado_en      timestamptz not null default now()
);

comment on table senales_web is
  'Senales extraidas del sitio del propio negocio (fuente distinta a Places). Alimentan los dos ejes del scoring.';
comment on column senales_web.tiene_pixel_meta is
  'Proxy legal y gratis de "invierte en Meta Ads": el pixel esta en su propia pagina publica.';
comment on column senales_web.es_responsive is
  'Sin meta viewport no es responsive. Senal del eje NECESIDAD: necesita sitio nuevo.';

alter table senales_web enable row level security;

-- ===========================================================================
-- prospecciones.score_detalle — por qué ese score
-- ===========================================================================
--
-- `score` y `razon` ya existían. Falta el desglose regla por regla, para que el
-- panel pueda mostrar "este lead sacó 68 porque X, Y, Z" y para poder depurar
-- por qué un lead quedó donde quedó. Sin esto, el score es un número sin
-- defensa — y la Via B1 pide transparencia, no solo un puntaje.
--
-- jsonb y no columnas porque el conjunto de reglas va a cambiar: agregar una
-- señal no debe requerir una migración.

alter table prospecciones
  add column if not exists score_detalle jsonb;

comment on column prospecciones.score_detalle is
  'Desglose regla por regla: {capacidad, necesidad, reglas:[{id,puntos,peso,razon}]}. jsonb porque el set de reglas cambia.';
