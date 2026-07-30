-- 012 · correos: quién aprobó y cuándo (auditoría)
--
-- ===========================================================================
-- Por qué esto va AHORA y no en la Fase 6
-- ===========================================================================
--
-- El producto final es una app interna donde VARIOS empleados aprueban campañas.
-- `correos.estado` ya decía *que* algo fue aprobado, pero no *quién* ni *cuándo*.
--
-- Es el único dato de todo el proyecto que **no se puede reconstruir después**:
-- no se puede inventar retroactivamente qué persona apretó un botón. Si se deja
-- para la Fase 6, todo lo aprobado antes queda sin autor para siempre.
--
-- Hace falta por dos razones distintas:
--
--  1. RESPONSABILIDAD interna. "¿Quién autorizó que le escribiéramos a este
--     cliente?" tiene que tener respuesta.
--  2. LEY 81. Ante un reclamo, mostrar qué persona autorizó ese envío y en qué
--     fecha es la diferencia entre tener un registro de tratamiento y no tenerlo.
--     El opt-out (migración 006) dice a quién NO escribir; esto dice quién
--     decidió escribir.
--
-- ===========================================================================
-- Por qué se guarda el email además del uuid
-- ===========================================================================
--
-- `aprobado_por` apunta a `auth.users`. Si mañana ese empleado se va y se borra
-- su cuenta, el FK se pone en null y el registro pierde al autor — justo lo que
-- un registro de auditoría no puede permitirse.
--
-- Por eso se guarda también `aprobado_por_email`: una copia del identificador al
-- momento de aprobar. Desnormalizar es lo correcto acá; la gracia de una
-- auditoría es que sobreviva a los cambios posteriores.
--
-- La edición no lleva copia del email: editar un borrador no autoriza nada, así
-- que no tiene el mismo peso legal que aprobar.

alter table correos
  add column if not exists aprobado_por       uuid references auth.users (id) on delete set null,
  add column if not exists aprobado_por_email text,
  add column if not exists aprobado_en        timestamptz,
  add column if not exists editado_por        uuid references auth.users (id) on delete set null,
  add column if not exists editado_en         timestamptz;

comment on column correos.aprobado_por is
  'Usuario que autorizo el envio. null en lo generado por el pipeline: el pipeline NO aprueba, solo los humanos.';
comment on column correos.aprobado_por_email is
  'Copia del identificador al momento de aprobar. Sobrevive al borrado de la cuenta: sin esto la auditoria se pierde.';

-- ===========================================================================
-- La auditoría es OBLIGATORIA, no opcional
-- ===========================================================================
-- Sin esta restricción, cualquier `update correos set estado='aprobado'` desde
-- un script dejaría un envío autorizado sin autor, y nadie se daría cuenta hasta
-- que hiciera falta. Que la base lo rechace es más confiable que recordarlo.
alter table correos drop constraint if exists correos_aprobado_con_autor;
alter table correos add constraint correos_aprobado_con_autor check (
  estado <> 'aprobado'
  or (aprobado_por_email is not null and aprobado_en is not null)
);

-- Consulta del panel: "¿qué aprobó cada uno esta semana?"
create index if not exists correos_aprobado_por_idx
  on correos (aprobado_por, aprobado_en desc) where aprobado_en is not null;
