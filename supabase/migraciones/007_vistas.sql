-- 007 · vistas — las puertas de envio, en la base de datos
--
-- Las reglas de "que se puede enviar" viven aca en vez de solo en el codigo
-- del panel. Asi la regla no se puede olvidar por accidente desde otro script,
-- y el fix (d) queda EXIGIDO en vez de solamente documentado.

-- ---------------------------------------------------------------------------
-- v_correos_enviables — lo unico que el panel (Fase 6) debe ofrecer aprobar
-- ---------------------------------------------------------------------------
-- Tres puertas:
--   1. el borrador esta pendiente de revision
--   2. el email pasa la puerta de calidad (Via B2: no quemar el dominio)
--   3. el email NO esta suprimido (fix d)
--
-- >>> OJO: la puerta 2 exige 'verificado' y por tanto EXCLUYE 'catch_all'.
-- Es la postura conservadora. En Panama muchos dominios de PYME son catch-all,
-- asi que esto puede recortar buena parte de la lista. Decision pendiente con
-- el jefe (ROADMAP #6). Si se decide enviarles, cambiar el IN de abajo.
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
  -- Puerta 2: calidad del email.
  and ct.estado_verificacion in ('verificado')
  -- Puerta 3: opt-out. Por email exacto o por dominio completo.
  and not exists (
    select 1
    from supresiones s
    where (s.email   is not null and lower(s.email) = lower(ct.email))
       or (s.dominio is not null and lower(ct.email) like '%@' || lower(s.dominio))
  );

comment on view v_correos_enviables is
  'Borradores aprobables: pendientes + email verificado + no suprimido. El panel solo debe leer de aqui.';

-- ---------------------------------------------------------------------------
-- v_buzones_saturados — el caso de las sucursales que comparten info@
-- ---------------------------------------------------------------------------
-- Si una cadena tiene 15 locales en Maps con el mismo buzon, aca aparece con
-- borradores_pendientes = 15. El operador debe aprobar UNO, no quince.
create or replace view v_buzones_saturados as
select
  lower(ct.email)             as email,
  count(distinct c.id)        as borradores_pendientes,
  count(distinct n.id)        as negocios_distintos,
  min(n.nombre)               as ejemplo_negocio
from correos c
  join contactos     ct on ct.id = c.contacto_id
  join prospecciones p  on p.id  = c.prospeccion_id
  join negocios      n  on n.id  = p.negocio_id
where c.estado in ('borrador', 'editado')
  and ct.email is not null
group by lower(ct.email)
having count(distinct c.id) > 1;

comment on view v_buzones_saturados is
  'Buzones con mas de un borrador pendiente (sucursales que comparten info@). Aprobar uno solo.';
