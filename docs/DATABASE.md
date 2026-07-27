# Modelo de datos — **DISEÑO CONGELADO**

**Fuente de verdad del modelo de datos.** Congelado 2026-07-25.
Implementación: `supabase/migraciones/*.sql` · Tipos: `src/dominio/tipos.ts`

Cualquier cambio a este modelo requiere una migración nueva (`00N_*.sql`), nunca
editar una migración ya aplicada. El runner (`npm run migrar`) detecta archivos
editados y avisa en vez de re-ejecutarlos.

---

## El esquema

```
busquedas ──────┐
 (el "por qué")  │
                 ├──► prospecciones ──────► correos
negocios ───────┘   (negocio × búsqueda)   (borrador)
 (la empresa)        · ESTADO de tubería        ▲
      │              · score + razón            │
      │                                         │
      └──────────► contactos ───────────────────┘
                    (el buzón)
                    · estado_verificacion

supresiones  (opt-out; se consulta antes de aprobar)

v_correos_enviables    ← las 3 puertas de envío, en la BD
v_buzones_saturados    ← sucursales que comparten info@
```

| Tabla | Qué es | Grano |
|---|---|---|
| `busquedas` | El `searchSpec` de una corrida: producto + categoría + ubicación + canal | 1 por corrida |
| `negocios` | La **empresa** (local físico) | 1 por `place_id` |
| `prospecciones` | Un **intento de venta** = (negocio × búsqueda). **Aquí vive el estado.** | 1 por par |
| `contactos` | El buzón público del negocio | 1 por (negocio, email) |
| `correos` | El borrador de Claude | 1 por (prospección, contacto) |
| `supresiones` | Lista de no-contactar | 1 por email o dominio |

---

## Los 4 fixes de arquitectura (y por qué)

El diseño original del roadmap tenía cuatro problemas con una raíz común: la
tabla `negocios` hacía **tres trabajos a la vez** — la empresa, el hallazgo, y
el intento de prospección. Separarlos resuelve los cuatro.

### (a) `negocios` ya no tiene `busqueda_id`

**Antes:** `negocios(busqueda_id, ...)`, un solo FK a `busquedas`.

**El problema:** era incompatible con el dedup que el propio roadmap pedía
("mismo negocio por dos búsquedas", Fase 3). Con un FK único, si dos búsquedas
encontraban el mismo negocio solo había dos salidas, y las dos eran malas:

- crear dos filas → el dedup falla y se le escribe dos veces
- guardar una fila → queda apuntando a la primera búsqueda y se pierde la traza
  de la segunda, lo que rompe la trazabilidad de la Vía B1

**Ahora:** una fila por empresa en `negocios`; el vínculo negocio↔búsqueda vive
en `prospecciones`. Un negocio hallado por 3 búsquedas = 1 fila en `negocios`
+ 3 en `prospecciones`.

### (b) `correos` cuelga de (prospección, contacto), no de negocio

**Antes:** `correos(negocio_id, ...)`.

**Dos problemas:**

1. **La unidad de envío es el email, no el negocio.** En Panamá las cadenas
   tienen N sucursales en Maps compartiendo el mismo `info@`. Con `negocio_id`
   se generaban N borradores distintos al **mismo buzón** → el destinatario
   recibe 15 correos casi iguales y nos marca como spam.
2. **No se sabía qué producto se ofreció.** Vía `prospeccion_id → busquedas.producto`
   queda gratis, y con eso el historial ("a este buzón ya le ofrecimos web en marzo").

La vista `v_buzones_saturados` expone el caso de las sucursales para que el
operador apruebe uno y no quince.

### (c) El estado de tubería vive en `prospecciones`, no en `negocios`

**Antes:** `negocios.estado`.

**El problema:** `aprobado` / `enviado` / `respondió` describen un intento de
vender **un producto**, no una propiedad de la empresa. Como el Modo 1 es
"elige un producto de la lista", el mismo negocio se prospecta para varios
productos con el tiempo — y con el estado en `negocios`, uno marcado `enviado`
para el producto A quedaba bloqueado para el producto B.

### (d) Existe tabla de supresiones desde la Fase 0

**Antes:** "opt-out funcional" mencionado en B7, sin tabla.

**El problema:** el cron de la Fase 7 vuelve a descubrir los mismos negocios
todos los días. Sin esta tabla, el sistema **re-contacta mañana a quien se dio
de baja ayer** — que es exactamente el incumplimiento que la Ley 81 sanciona.
Cuesta una tabla y un `NOT EXISTS`.

### Nota sobre "dedup por dominio + nombre normalizado"

Esa regla, tal cual estaba escrita, **colapsaba sucursales legítimas**: las
cadenas tienen N locales con el mismo dominio y el mismo nombre, y son negocios
distintos (direcciones distintas). Resolución:

| Qué se deduplica | Por qué clave |
|---|---|
| **Negocios** | `place_id` (único por local físico) |
| **Envíos** | `email` (en `contactos` / `correos`) |

El **dominio no es clave de dedup de negocios** — es clave de *agrupación de envío*.

---

## Estados

### `prospecciones.estado` — posición en la tubería

```
negocio_encontrado → contacto_encontrado → priorizado
                   → correo_generado → aprobado → enviado → respondió
```

Laterales / terminales: `sin_contacto` · `descartado_por_humano`

- **Estado inicial:** `negocio_encontrado`. Se eliminó `nuevo` del roadmap
  original: una prospección se crea *en* el hallazgo, así que `nuevo` no era
  alcanzable.
- **Priorizar, no descartar:** un lead sin email no se borra — se marca
  `sin_contacto` y queda para revisar.

### `contactos.estado_verificacion` — entregabilidad

```
pendiente → verificado | catch_all | invalido | no_encontrado
```

**Una verdad, un lugar.** La entregabilidad vive **solo aquí**, nunca en
`prospecciones.estado`. El estado de la prospección es *posición*; la calidad
del email es del *contacto*. Si estuviera en los dos lados, se desincronizan.

`pendiente` se agregó al modelo del roadmap: hacía falta un valor por defecto
para el email que existe pero aún no pasó por el verificador (Fase 3).

---

## Las tres puertas de envío

Implementadas en `v_correos_enviables` (migración 007). El panel de la Fase 6
debe leer **solo de esta vista**, para que la regla no se pueda olvidar:

1. El borrador está pendiente de revisión (`borrador` o `editado`)
2. El email pasa la puerta de calidad → `estado_verificacion = 'verificado'`
3. El email **no** está en `supresiones` (por email exacto o por dominio)

> ⚠️ **La puerta 2 excluye `catch_all`.** Es la postura conservadora. En Panamá
> muchísimos dominios de PYME son catch-all (cPanel por defecto), así que esto
> puede recortar buena parte de la lista útil. **Decisión pendiente con el jefe**
> (ROADMAP #6). Si se decide enviarles, se cambia el `IN` de la vista.

---

## Seguridad

RLS está **activo en todas las tablas, sin políticas**. Eso significa:

- la clave `service_role` (scripts, cron) pasa — salta RLS por diseño
- la clave `anon` queda **bloqueada** — que es el default seguro

Las políticas del panel se agregan en la Fase 6, cuando exista autenticación.
**No mover `service_role` al cliente web.**
