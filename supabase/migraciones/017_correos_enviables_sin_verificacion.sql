-- 017 · v_correos_enviables ya no exige 'verificado'
--
-- ===========================================================================
-- La decisión pendiente desde el diseño original, resuelta
-- ===========================================================================
--
-- La migración 007 dejaba escrito, a propósito:
--
--   ">>> OJO: la puerta 2 exige 'verificado' y por tanto EXCLUYE 'catch_all'.
--   Es la postura conservadora [...] Decision pendiente con el jefe (ROADMAP #6)."
--
-- Decisión de negocio (2026-08-04): no se paga MillionVerifier. Con la puerta
-- vieja intacta, esto tenía una consecuencia que nadie había notado todavía:
-- NINGÚN borrador nuevo iba a poder aprobarse nunca, porque ningún contacto
-- real va a llegar a 'verificado' sin la llave — se quedan todos en
-- 'pendiente' para siempre. La cola de revisión iba a estar vacía por
-- construcción, sin ningún error que lo avisara.
--
-- La resolución de la decisión pendiente es la misma frase que ya se usó para
-- todo lo demás en este proyecto: "que el empleado decida". Antes el sistema
-- decidía solo (solo 'verificado' pasa); ahora decide el empleado, en dos
-- puntos distintos y ya existentes — cuando elige a quién generarle un
-- borrador, y cuando aprueba ese borrador puntual. La puerta automática deja
-- de exigir un estado positivo y pasa a bloquear solo lo que es un hecho
-- técnico firme, no una decisión de negocio:
--
--   'invalido'  → el verificador CONFIRMÓ que el correo no existe. Enviar ahí
--                 no es un riesgo de reputación que alguien pueda asumir a
--                 sabiendas: es un rebote garantizado. Se sigue bloqueando.
--   todo lo demas ('pendiente', 'verificado', 'catch_all', 'no_encontrado')
--               → pasan. 'pendiente' es el estado real de todo lo que se
--                 genera ahora; los demas ya eran indeterminados ("no se" no
--                 es "no cumple", el mismo criterio de toda la Fase 4).

create or replace view v_correos_enviables as
select
  c.id                  as correo_id,
  c.asunto,
  c.cuerpo,
  c.cta,
  c.modelo,
  c.estado              as estado_correo,
  ct.id                 as contacto_id,
  ct.email,
  ct.estado_verificacion,
  n.id                  as negocio_id,
  n.nombre              as negocio,
  n.dominio,
  n.rating,
  n.num_resenas,
  b.producto,
  b.categoria,
  b.ubicacion,
  p.id                  as prospeccion_id,
  p.score,
  p.razon
from correos c
  join contactos     ct on ct.id = c.contacto_id
  join prospecciones p  on p.id  = c.prospeccion_id
  join negocios      n  on n.id  = p.negocio_id
  join busquedas     b  on b.id  = p.busqueda_id
where c.estado in ('borrador', 'editado')
  and ct.email is not null
  -- Puerta 2: ya no exige 'verificado'. Bloquea solo lo que se CONFIRMÓ malo.
  and ct.estado_verificacion <> 'invalido'
  -- Puerta 3: opt-out. Por email exacto o por dominio completo.
  and not exists (
    select 1
    from supresiones s
    where (s.email   is not null and lower(s.email) = lower(ct.email))
       or (s.dominio is not null and lower(ct.email) like '%@' || lower(s.dominio))
  );

comment on view v_correos_enviables is
  'Borradores aprobables: pendientes de revision + email no confirmado como invalido + no suprimido. El panel solo debe leer de aqui.';
