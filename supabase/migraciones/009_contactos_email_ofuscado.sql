-- 009 · contactos.email_ofuscado
--
-- POR QUÉ UNA COLUMNA Y NO UN VALOR MÁS EN origen_del_correo
--
-- El extractor de la Fase 2 encontró un patrón común en sitios panameños: el
-- email escrito como "ventas (arroba) dominio.pa" o "gerencia [at] dominio.pa"
-- para esquivar bots. Sin desofuscar se pierde el lead completo.
--
-- La tentación era agregar 'ofuscado' a la lista de `origen_del_correo`. Está
-- mal: son dos ejes distintos.
--   · origen_del_correo = DÓNDE estaba (footer, /contacto, mailto)
--   · email_ofuscado    = CÓMO estaba escrito
-- Un email de footer puede estar ofuscado o no. Meterlo en el mismo campo
-- obligaría a elegir entre los dos datos.
--
-- Y no es solo prolijidad: un negocio que esconde su correo a propósito está
-- señalando que no quiere correo automatizado. Eso importa para la Ley 81 y
-- para decidir a quién escribirle — conviene poder filtrarlo, no perderlo.

alter table contactos
  add column if not exists email_ofuscado boolean not null default false;

comment on column contactos.email_ofuscado is
  'El email venia escrito para esquivar bots ("x (arroba) y.com"). Senal de que el negocio no quiere correo automatizado: considerar antes de aprobar envio.';

-- Para poder revisarlos aparte sin escanear la tabla entera.
create index if not exists contactos_ofuscado_idx
  on contactos (negocio_id) where email_ofuscado;
