-- 015 · políticas RLS
--
-- ===========================================================================
-- LEER ESTO ANTES DE CONFIAR EN ESTAS POLÍTICAS
-- ===========================================================================
--
-- Estas políticas son la SEGUNDA capa de seguridad, no la primera.
--
-- El panel consulta Postgres directo (`core/postgres.ts`, con la contraseña de
-- la base), y esa conexión **salta RLS por completo**. La seguridad real del
-- panel es el guard de autenticación en `middleware.ts`: sin sesión, no se llega
-- a ninguna ruta y por lo tanto no se ejecuta ninguna consulta.
--
-- ¿Entonces para qué existen estas políticas?
--
--   Para que el día que alguien use la llave PÚBLICA (`sb_publishable_`) desde el
--   navegador —un gráfico en tiempo real, una app móvil, un componente de
--   cliente— la base no esté abierta. Sin políticas, RLS activo bloquea todo, lo
--   cual es seguro pero inservible; con estas políticas, un usuario autenticado
--   puede leer, y un anónimo no puede nada.
--
-- Lo que NO hay que creer: que estas políticas están conteniendo al panel. No lo
-- están. Si mañana se quiere que RLS sea la única frontera, hay que migrar las
-- consultas de `pg` al cliente de Supabase con el token del usuario — que es un
-- trabajo aparte y no está hecho.
--
-- ---------------------------------------------------------------------------
-- El criterio: cualquier empleado autenticado ve todo
-- ---------------------------------------------------------------------------
-- Es una herramienta interna de un equipo chico. No hay razón para que un
-- empleado no vea los leads de otro; al contrario, la idea es que se repartan la
-- revisión. Si algún día hace falta separar por equipo o por producto, se agrega
-- una columna de propietario y se ajustan estas políticas — no antes.

-- Los datos del pipeline: lectura para autenticados.
do $$
declare t text;
begin
  foreach t in array array[
    'busquedas', 'negocios', 'prospecciones', 'contactos',
    'correos', 'supresiones', 'senales_web', 'corridas'
  ]
  loop
    execute format('drop policy if exists %I on %I', 'lectura_autenticados', t);
    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      'lectura_autenticados', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Escritura: solo lo que un empleado hace a mano desde el panel
-- ---------------------------------------------------------------------------
-- El pipeline escribe con la conexión de servidor (que salta RLS), así que acá
-- solo hace falta habilitar las acciones humanas.

-- Aprobar / editar / descartar un correo.
drop policy if exists escritura_correos on correos;
create policy escritura_correos on correos
  for update to authenticated using (true) with check (true);

-- Encargar una búsqueda.
drop policy if exists insertar_busquedas on busquedas;
create policy insertar_busquedas on busquedas
  for insert to authenticated with check (true);

drop policy if exists insertar_corridas on corridas;
create policy insertar_corridas on corridas
  for insert to authenticated with check (true);

-- Cambiar el estado de una prospección (descartar un lead).
drop policy if exists escritura_prospecciones on prospecciones;
create policy escritura_prospecciones on prospecciones
  for update to authenticated using (true) with check (true);

-- Dar de baja a alguien que lo pidió. Es lo más sensible que un empleado puede
-- escribir, y tiene que poder hacerlo sin pasar por un desarrollador.
drop policy if exists insertar_supresiones on supresiones;
create policy insertar_supresiones on supresiones
  for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Nada para `anon`
-- ---------------------------------------------------------------------------
-- No se crea ninguna política para el rol `anon` a propósito: sin sesión, no se
-- ve nada. Si en el futuro hace falta algo público, va con su propia política
-- explícita y acotada, no aflojando estas.

comment on table busquedas is
  'Metadata de cada corrida del pipeline (searchSpec). Via B1: trazabilidad. RLS: lectura para autenticados (2da capa; la 1ra es el guard de rutas).';
