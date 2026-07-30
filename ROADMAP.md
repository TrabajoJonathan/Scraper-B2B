# ROADMAP — Buscador de leads B2B (Codeflow)

**De "script que raspa" a "herramienta interna seria"**
**Módulo de Prospección Inteligente de Clientes · Codeflow**
**Alcance:** Modo 1 (lista del jefe) de punta a punta sobre canal Google Maps. Modo 2 = add-on documentado (ver sección abajo), **no build paralelo**.
**Creado:** 2026-07-25 · **Última actualización:** 2026-07-25 (v1.3)
**Estado:** diseño **CONGELADO** · código en curso · Hito 0.5 escrito, esperando llaves de API

> **El diseño está congelado.** Arquitectura → `docs/ARCHITECTURE.md`.
> Modelo de datos → `docs/DATABASE.md`. **Este archivo manda en el plan:**
> qué se construye, en qué orden, y qué queda explícitamente fuera.

---

## Objetivo

Que Codeflow (o un cliente) pueda mirar esta herramienta y decir *"esto es un sistema serio:
encuentra clientes de forma automática, con datos públicos, trazable de punta a punta, y con
un humano aprobando antes de enviar nada"*. El salto NO está en raspar más rápido, sino en
**trazabilidad, verificación, control humano y mantenibilidad** — lo que separa una herramienta
profesional de un scraper suelto.

## Filosofía — "esqueleto que camina"

En vez de construir todo el descubrimiento primero, hacemos una **rebanada fina de punta a
punta** (un producto, un canal, pocos negocios) hasta que un correo salga revisado. Así ves
algo funcionando y validas el flujo antes de engrosar cada paso.

> **Honestidad sobre el orden:** el roadmap está por **capas** (cada fase completa una etapa),
> y el primer correo real aparecería hasta la Fase 5. Para no caer en la trampa de pulir capas sin
> enviar nada, el **Hito 0.5 va PRIMERO y NO es opcional:** una rebanada de un día — 5 negocios a
> mano (llamando Places de verdad) → sacar 1 email → 1 borrador de Claude en pantalla, aunque sea feo
> y desechable. Ver el flujo funcionar en un día enseña y motiva más que perfeccionar cada capa.
> **Ese Hito 0.5 ya incluye el "spike" de Places:** ver los campos reales que devuelve la API antes
> de escribir el DDL de las tablas.

### Hito 0.5 · la rebanada fina 🔪 (PRIMERO · NO OPCIONAL)

Un producto, un canal, 5 negocios, hasta que salga **un borrador de correo en pantalla**.
Feo y desechable a propósito. No toca Supabase, no envía nada, solo imprime.

`npm run hito05` → `src/scripts/hito-0.5.ts`

- [x] Paso 1 · Places API: 5 negocios reales de Panamá, normalizados
- [x] **Spike:** reporte de cobertura real de campos + volcado a `salidas/` para revisar a mano
- [x] Paso 2 · Extraer 1 email del sitio del negocio *(provisional: `fetch` + regex)*
- [x] Paso 3 · Borrador con Claude Haiku 4.5, salida estructurada, con costo real por correo
- [x] Guard de credenciales que dice exactamente qué falta y cómo conseguirlo
- [ ] **Ejecutarlo** ← falta `GOOGLE_PLACES_API_KEY` y `ANTHROPIC_API_KEY`

**Criterio de éxito:** un correo que un humano de verdad enviaría sin reescribirlo entero.

> **Por qué el spike importa:** el reporte de cobertura no dice qué campos *documenta* Google, sino
> cuántos vienen **llenos en negocio panameño real**. Si resulta que 4 de 5 restaurantes no tienen
> `websiteUri`, eso cambia el plan de la Fase 2 antes de gastar en Apify.

## El plan tiene DOS vías paralelas

- **Vía A · Funcional** — el pipeline que produce leads (descubrir → contacto → verificar → priorizar → redactar → revisar → automatizar).
- **Vía B · Madurez y trazabilidad** — lo que lo hace *confiable*: trazabilidad del dato, calidad del email, documentación, monitoreo, QA, envío profesional, cumplimiento legal. **Es el mayor diferenciador.**

## Reglas del proyecto (restricciones)

- ✅ **TypeScript / Node** · **Supabase (PostgreSQL)** · **Vercel** · **Apify** · **Google Places API** · **Claude Haiku**
- ✅ **Solo datos públicos**, respetando la **Ley 81 de Panamá** (opt-out, sin datos sensibles)
- ✅ **Revisión humana antes de enviar** — SIEMPRE. Nada sale automático.
- ✅ **Priorizar, no descartar** (al arrancar casi todo negocio es cliente potencial)
- ✅ **Modo 1 primero**, y dentro de Modo 1 **empezar por Google Maps** (se reutiliza tal cual en Modo 2)
- ❌ **Sin scraping propio de LinkedIn** (decisión del jefe: riesgo de baneo/legal)
- ❌ **Sin CRM externo** en v1 → vista filtrable sobre Supabase (HubSpot = opcional futuro)
- ❌ **Sin envío automático** — el cron arma la lista; el humano aprueba
- ⚙️ Apify corre los scrapers; nosotros **orquestamos** desde Vercel/Node

## Regla de dependencia (mantener intacta)

`rutas/UI → servicios → core (supabase, apis externas)` — nunca al revés.
Cada herramienta externa (Apify, Places, Claude, verificador) vive detrás de **su propio servicio**,
para poder cambiarla sin tocar el resto.

## Modo 1 vs Modo 2 — contrato de interfaz (NO build paralelo)

> **Decisión de arquitectura.** Este roadmap construye **Modo 1**. Modo 2 **no se construye en paralelo** — se enciende como add-on cuando Modo 1 ya camina. Esta sección documenta *la costura*, no un plan aparte, para no cerrarle la puerta.

**Los dos modos convergen en el mismo pipeline.** Lo único que cambia es *quién llena el "search spec"*:

```
Modo 1 · lista del jefe ─────────────┐
                                     ├──► [ mismo pipeline: descubrir → contacto →
Modo 2 · producto libre ─► CEREBRO ──┘      verificar → priorizar → redactar → revisar ]
```

- **Modo 1:** la categoría a buscar viene de la lista del jefe.
- **Modo 2:** Claude razona `producto → quién lo COMPRA → categoría` (ej: "automatización legal" → firmas de abogados). Busca al **comprador**, no al productor.
- **Todo lo que está DESPUÉS del punto de convergencia es idéntico.** Modo 2 = Modo 1 + un servicio al frente (`cerebroService`).

### La costura: el "search spec" genérico (respetar desde Fase 0-1)

El pipeline **consume un objeto de búsqueda y es ciego a quién lo generó**:

```
searchSpec = { producto, categoria, ubicacion, canal }
```

- Modo 1 llena `categoria` desde la lista; Modo 2 la llena con el cerebro. **El pipeline no sabe ni le importa cuál fue.**
- Esto encaja con la **regla de dependencia** (cada herramienta detrás de su servicio) y con la tabla `busquedas`, que ya guarda `producto + categoria + ubicacion + canal` sin importar el origen.
- **Regla:** nunca hardcodear "la entrada es la lista del jefe" dentro del pipeline. La entrada es un `searchSpec`. Gratis ahora; caro retrofittear después.

### Secuencia de entrega (barato, no simultáneo)

1. **Modo 1 de punta a punta** (Fases 0→6): un correo real saliendo sobre canal Google Maps.
2. **Encender Modo 2** = enchufar `cerebroService` antes del pipeline. Estimado: **~1 día** sobre el mismo canal.
3. Entregar los dos modos funcionando > dos modos a medias.

### ⚠️ El trabajo escondido NO es Modo 2 — es el segundo canal

Por la regla *"el canal depende del PRODUCTO, no del modo"*:
- Producto web/local → **Google Maps** ✅ (este roadmap lo cubre).
- Producto de automatización → **Vacantes** (Konzerta/Computrabajo vía Apify) → **paso 14, fuera de este roadmap**.

Modo 2 sobre Google Maps es barato. Modo 2 que rutea a **vacantes** ya es otro build (el segundo canal). No prometer vacantes hasta construir ese canal.

### Cabo suelto que decide dónde vive el cerebro

Ver `Decisiones pendientes con el jefe #2`: **¿la lista de Modo 1 ya trae la categoría, o Claude la razona?**
- Si la lista **ya trae categoría** → Modo 1 sin cerebro; Modo 2 = agregar el cerebro.
- Si la lista trae **solo el producto** → **Modo 1 ya usa el cerebro**, y Modo 2 = quitar el candado de "tiene que estar en la lista" (casi trivial).

Confirmar esto **antes de la Fase 0**, porque cambia dónde vive `cerebroService`.

---

## El ciclo de vida de un lead (estados)

> **Congelado.** Detalle completo y justificación de cada fix en `docs/DATABASE.md`.

El estado marca **solo la posición en la tubería**, y vive en **`prospecciones`**
— la tabla (negocio × búsqueda) — **no en `negocios`**:

```
negocio_encontrado → contacto_encontrado → priorizado
                   → correo_generado → aprobado → enviado → respondió
```

Laterales / terminales: `sin_contacto` (no tiene web/email) · `descartado_por_humano`.

- **¿Por qué en `prospecciones` y no en `negocios`?** Porque `aprobado`/`enviado`/`respondió`
  describen un intento de vender **un producto**, no una propiedad de la empresa. Como el Modo 1
  es "elige un producto de la lista", el mismo negocio se prospecta para varios productos con el
  tiempo; con el estado en `negocios`, uno marcado `enviado` para el producto A quedaba bloqueado
  para el producto B. *(Fix de arquitectura (c).)*
- **Se eliminó `nuevo`:** una prospección se crea *en* el hallazgo, así que ese estado no era
  alcanzable. El inicial es `negocio_encontrado`.
- **Una verdad, un lugar:** la ENTREGABILIDAD del email (`pendiente` / `verificado` / `catch_all` /
  `invalido` / `no_encontrado`) **NO** es un estado del lead — vive **solo en
  `contactos.estado_verificacion`**. El estado de la prospección es *posición*; la calidad del
  email es del *contacto*. Si estuviera en los dos sitios, se desincronizan.
- **Priorizar, no descartar:** un lead sin email no se borra — se marca `sin_contacto` y queda.

---

## Punto de partida (actualizado 2026-07-25)

| Capacidad | Estado actual | Brecha |
|---|---|---|
| Proyecto Node/TS | ✅ **hecho** — Node 24 nativo, sin build, `npm run typecheck` limpio | — |
| Modelo de datos | ✅ **hecho, congelado y APLICADO** — 8 migraciones · `npm run verificar` → **40/40** | — |
| Persistencia (Supabase) | ✅ **conectado y verificado** — proyecto `lrfaulyhdcvtutnzxsae` | — |
| Descubrimiento (Places API) | ✅ **escrito** — `core/places.ts` + `placesService` | Correr contra la API real |
| Redacción con Claude | ✅ **escrito** — `redaccionService`, salida estructurada | Correr contra la API real |
| Extracción de contacto | 🟡 **provisional** — `fetch` + regex, se reemplaza por Apify | Fase 2 (necesita Apify) |
| Hito 0.5 (rebanada fina) | 🟡 **escrito, sin ejecutar** | **Falta `GOOGLE_PLACES_API_KEY` y `ANTHROPIC_API_KEY`** |
| Documentación técnica | ✅ ARCHITECTURE + DATABASE congelados | SECURITY / DEPLOYMENT / USER_MANUAL (B3) |
| **Llaves de API** (Places, Claude) | ❌ **No** | **Bloquea el Hito 0.5 — es el cuello de botella de hoy** |
| Prueba de regresión del modelo | ✅ `npm run verificar` — 40 comprobaciones | Ampliarla en B5 |
| Apify (cuenta + crédito) | ❌ No | Esperando al jefe → bloquea Fase 2 |
| Lista de productos (Modo 1) | ❌ No | Esperando al jefe (decisión #1) |
| Verificación de email | ⬜ No existe | Fase 3 |
| Scoring / priorización | ⬜ No existe | Fase 4 |
| Panel + revisión humana | ⬜ No existe | Fase 6 |
| Automatización (cron) | ⬜ No existe | Fase 7 |
| Envío (dominio + warm-up) | ⬜ No existe | Vía B6 · diferido tras Modo 1 |

**El cuello de botella no es código: son dos llaves de API.** Todo lo que se puede
construir sin credenciales, está construido.

---

## Stack por capa

| Necesidad | Herramienta | Estado |
|---|---|---|
| Orquestación + panel | **TypeScript/Node en Vercel** | capa gratis |
| Base de datos | **Supabase (PostgreSQL)** — dedup por dominio + nombre normalizado | ya pagado |
| Descubrir negocios | **Google Maps Places API** (categoría + ubicación → nombre, dir., tel., web, rating, reseñas; **no email**) | capa gratis para arrancar |
| Extraer contacto | **Apify** entra al sitio web → email / tel / redes públicas | **nuevo (esperando cuenta)** |
| Contacto · plan B | **Apollo / Hunter** solo si la web no trae contacto | opcional |
| Verificar email | **MillionVerifier** (o Bouncer) antes de enviar | ~centavos |
| Router + cerebro + scoring + redacción | **Claude Haiku 4.5** (API) | ~$5 para empezar |
| Automatización | **Vercel Cron** o `pg_cron` de Supabase | ya pagado |
| Envío | Dominio dedicado + warm-up + opt-out (ESP por definir) | **Vía B · diferido** |

---

# VÍA A — Funcional (el pipeline)

### Fase 0 · Cimientos 🔧 (BLOQUEANTE)
Proyecto conectado + modelo de datos. **Esquema congelado — ver `docs/DATABASE.md`.**
- [x] Crear proyecto Node/TS (Node 24 nativo, sin build; `npm run typecheck` limpio)
- [x] **Definir los estados** antes de tocar tablas
- [x] Migración `001` `busquedas` — el "por qué" de cada corrida (searchSpec + `fuente`)
- [x] Migración `002` `negocios` — la EMPRESA. **Sin `busqueda_id`** *(fix a)*
- [x] Migración `003` `prospecciones` — (negocio × búsqueda). **Sede del estado** *(fix a + c)*
- [x] Migración `004` `contactos` — email, `origen_del_correo`, `estado_verificacion`
- [x] Migración `005` `correos` — cuelga de (prospección, contacto) *(fix b)*
- [x] Migración `006` `supresiones` — opt-out desde el día 1 *(fix d)*
- [x] Migración `007` vistas — las 3 puertas de envío, exigidas en la BD
- [x] Migración `008` — fix del trigger: `clock_timestamp()` en vez de `now()`
- [x] Runner de migraciones idempotente (`npm run migrar`)
- [x] Servicios base detrás de la regla de dependencia
- [x] **Esquema aplicado en Supabase** (proyecto `lrfaulyhdcvtutnzxsae`)
- [x] **Verificado contra la base real: `npm run verificar` → 40/40** ✅
- [ ] Deploy vacío en Vercel que responda

**Entregable:** Proyecto conectado + esquema en Supabase. **Esfuerzo:** M
**Estado:** ✅ **HECHO y verificado.** Solo queda el deploy vacío de Vercel, que no bloquea nada.

> **`npm run verificar`** no es un test unitario: es una **prueba de regresión del modelo**.
> Comprueba que los 4 fixes siguen en pie y que las restricciones muerden de verdad — que el
> `place_id` duplicado se rechaza, que un email `pendiente` no es enviable, que el opt-out por
> dominio funciona. Corre dentro de una transacción que siempre se revierte, así que es seguro
> contra producción. Es el arranque de **B5 (QA)**: correr esto tras cada cambio de esquema.

---

### Fase 1 · Descubrimiento 🔎
Elegir producto → canal. Places API: categoría + ubicación → negocios reales.
- [x] Servicio `placesService`: `buscar(searchSpec, opciones)` → negocios normalizados
- [x] **Capturar los campos gratis de Places** (rating, num_reseñas, web) — alimentan el scoring
- [x] Normalización de nombre para dedup (quita acentos y sufijos societarios: `S.A.`, `Ltda`, `S. de R.L.`)
- [x] Guardar: 1 fila en `negocios` (la empresa) + 1 en `prospecciones` (el hallazgo)
- [x] **Dedup por `place_id`**, no por dominio+nombre — ver abajo
- [x] **Trocear la búsqueda** por zona (`buscarConTroceo`), con dedup entre zonas y conteo de llamadas
- [x] Idempotencia: correr la misma búsqueda dos veces no duplica nada; el upsert **sí** refresca
      rating y nº de reseñas (cambian con el tiempo) sin pisar el estado de la prospección
- [x] Cerrados permanentemente: se guardan (es un hecho) pero **no se les abre prospección**
- [x] **Probado contra la base real: `npm run probar:fase1` → 25/25** ✅
- [ ] Cambiar el fixture por la llamada real a Places ← falta la llave

> ⚠️ **Dos cosas que cambiaron respecto al plan original:**
>
> **1. Techo de Places: ~60 resultados por consulta** (20 por página × 3 páginas máximo).
> Para sacar 500 abogados en Panamá NO alcanza con una llamada: hay que trocear por zona y
> subcategoría e iterar. Eso cambia la forma de `placesService` (es un iterador sobre una grilla,
> no una llamada) y hay que costearlo antes de prometer volumen.
>
> **2. El dedup NO es "por dominio + nombre normalizado".** Esa regla colapsa sucursales
> legítimas: las cadenas panameñas tienen N locales en Maps con el mismo dominio y el mismo
> nombre, y son negocios distintos. Dedup de **negocios** = `place_id`. Dedup de **envíos** =
> `email`. El dominio es clave de *agrupación de envío*, no de dedup. Ver `docs/DATABASE.md`.

**Entregable:** Tabla con negocios reales de Panamá. **Esfuerzo:** M
**Estado:** 🟢 **lógica completa y probada** con datos de fixture contra la base real (25/25).
Falta solo cambiar el lector de fixture por la llamada real — es un parámetro, no código nuevo.

> **Cómo se probó sin la llave:** el lector de Places se **inyecta** en `buscar()`. En producción
> es el cliente HTTP real; en la prueba, un fixture en `src/fixtures/` con 7 negocios sintéticos
> que ejercitan los casos borde a propósito: 2 sucursales de una cadena con el mismo dominio, uno
> sin web, uno sin rating, uno cerrado permanentemente, uno cuyo sitio solo tiene formulario, y
> respuesta paginada. Así el pipeline queda validado hoy y cuando llegue la llave no se estrena
> código sin probar.
>
> ⚠️ Los fixtures **no dicen nada sobre la realidad panameña** — la cobertura real de campos sigue
> dependiendo del spike del Hito 0.5. Prueban el código, no el mercado.

**Costeo del troceo (antes de gastar):** cada zona consume entre 1 y 3 llamadas según cuántos
resultados tenga. Con las 8 zonas de `ZONAS_CIUDAD_PANAMA` el techo son **24 llamadas por
categoría**; si se sube a 40 zonas, ~120. `buscarConTroceo` devuelve el conteo por zona
justamente para poder ver el número antes de lanzarlo en serio.

---

### Fase 2 · Contacto ✉️ 🟢 *lógica lista y probada (31/31)*
Entrar a la web de cada negocio → contacto público.
- [x] Servicio `contactoService`: dado un negocio con web → email / redes. **Provisional** (`fetch` +
      regex); se reemplaza por Apify reescribiendo SOLO ese archivo, la firma no cambia
- [x] Recorre varias rutas (`/`, `/contacto`, `/contact`, `/contactenos`, `/nosotros`, `/about`) y
      **para en la primera que dé email** — con Apify cada petición se factura
- [x] **Desofusca** `(arroba)` / `[at]` / `(punto)`: sin esto se pierde el lead completo, no un dato
- [x] Prioriza candidatos: dominio propio > `info@`/`ventas@` > gmail suelto
- [x] Filtra basura (DSN de Sentry, assets `@2x`, `noreply`, plantillas)
- [x] Guardar en `contactos` con **origen_del_correo** + **email_ofuscado** (migración `009`)
- [x] Rescata redes (Instagram/Facebook/WhatsApp) aunque el email esté en otra página
- [x] Marcar `contacto_encontrado`; si no hay email → `sin_contacto` (**NO borrar**)
- [x] `marcarSinWeb()` — cierra a los que no tienen web (ver el bug de abajo)
- [x] **No retrocede:** una prospección en `aprobado` no vuelve a `contacto_encontrado`
- [x] **Probado contra la base real: `npm run probar:fase2` → 31/31** ✅
- [ ] Cambiar el `fetch` provisional por Apify ← falta la cuenta

**Entregable:** Negocios con su correo (aunque sea genérico `info@`). **Esfuerzo:** M
**Estado:** 🟢 **lógica completa y probada** con 6 patrones de sitio panameño en fixtures.

> 🐛 **Bug que encontró la prueba:** un negocio **sin sitio web** nunca entraba a la Fase 2
> (`pendientesDeContacto` filtra por `sitio_web is not null`), así que **nada lo marcaba jamás**:
> se quedaba en `negocio_encontrado` y el cron diario lo iba a re-examinar todos los días sin que
> pudiera avanzar nunca. Se agregó `marcarSinWeb()`, que hay que correr al **cerrar** la Fase 2 de
> una búsqueda. Ahora no queda ninguna prospección varada.
>
> 💡 **Se confirmó el caso del fix (b):** las 2 sucursales de la cadena cayeron en el **mismo**
> `reservas@laterraza.com.pa`. En la Fase 5 eso serían 2 borradores al mismo buzón — los detecta
> `v_buzones_saturados` y el operador aprueba uno, no dos.
>
> 🔵 **Decisión que aparece aquí:** ¿se le escribe a un negocio que **ofuscó** su email a propósito?
> Ofuscarlo es una señal explícita de que no quiere correo automatizado. Hoy se guarda con la marca
> `email_ofuscado` y **sí** es enviable. Vale revisarlo junto con la decisión #6 (`catch_all`).

---

### Fase 3 · Verificar + limpiar ✅ 🟢 *lógica lista y probada (23/23)*
Verificar el email antes de que exista cualquier envío → protege el dominio.

**Para qué existe esta fase:** mandar correo a direcciones muertas sube la tasa de rebote, y una
tasa alta hace que Gmail/Outlook manden **todo** nuestro correo a spam — incluido el que sí llega a
clientes reales. El estándar de la industria es rebote **< 2%**.

- [x] Servicio `verificarService` (MillionVerifier): estado por email
- [x] Escribir el resultado SOLO en `contactos.estado_verificacion` (el estado de la prospección NO cambia por esto)
- [x] **Verificar por email ÚNICO, no por fila de `contactos`** — ver abajo, es la decisión que importa
- [x] Dedup fino: `buzonesCompartidos()` reporta los buzones que comparten varios negocios
- [x] Migración `010`: `verificado_en` (la validez del email caduca) y `es_rol` (argumento legal)
- [x] Idempotente: no re-cobra lo ya verificado, pero permite forzar re-verificación por antigüedad
- [x] Una falla de configuración (llave inválida, sin créditos) **revienta** en vez de marcar emails buenos como malos
- [x] **Probado contra la base real: `npm run probar:fase3` → 23/23** ✅
- [ ] Cambiar el fixture por la llamada real ← falta la llave de MillionVerifier

**Entregable:** Lista limpia con calidad de email marcada. **Esfuerzo:** S
**Estado:** 🟢 **lógica completa y probada**, encadenada con las Fases 1 y 2.

> 💰 **La decisión que importa: se verifica por EMAIL ÚNICO, no por contacto.**
>
> Ya sabemos que las sucursales de una cadena comparten buzón. En la prueba: **3 llamadas a la API
> actualizaron 4 filas.** Verificar fila por fila traía dos problemas:
> 1. **Cuesta plata de más** — se paga dos veces la misma respuesta.
> 2. **Deja las filas inconsistentes** — la detección de `catch_all` no es determinista, así que dos
>    llamadas al mismo email pueden dar resultados distintos. Terminarías con una sucursal
>    `verificado` y la otra `catch_all`, sin razón para preferir una.
>
> La propagación es **global**, no limitada a la búsqueda: si el email aparece en otra búsqueda, ya
> queda resuelto. A escala eso importa — en una cadena de 15 locales son 14 verificaciones ahorradas.
>
> ⚖️ **`es_rol` refuerza la postura legal.** El verificador dice gratis si el buzón es de rol
> (`info@`, `ventas@`) o de una persona. Un buzón de rol **no identifica a un individuo**, así que
> es mucho menos "dato personal" bajo la Ley 81. Poder decirle a un abogado *"el 90% de nuestra base
> son buzones de rol"* es un dato medible, no una opinión. Viene en la misma llamada: no guardarlo
> significaría pagar otra verificación después solo para saberlo.

---

### Fase 4 · Priorizar 📊 🟢 *modular, lista y probada (29/29)*

**Decidido con el jefe (29 jul):** se puntúa contra **el producto** que se va a ofrecer, con sus
6 señales universales como base, y una web fea **sube** el score "porque tiene más necesidad".

- [x] **Motor modular**: recibe `Regla[]` + pesos y produce el score. **No menciona ninguna señal.**
      Hay una prueba que lo verifica leyendo el código fuente del motor.
- [x] Cada señal es una regla **independiente y pura** (sin base de datos, sin red, sin reloj)
- [x] Pesos en `scoring/configuracion.ts` — editar ahí no toca motor ni reglas. Peso 0 = apagada
- [x] **Dos ejes**: `capacidad` (las 6 señales del jefe) y `necesidad` (la que confirmó)
- [x] Guardar **score + razón + `score_detalle`** regla por regla (migración `011`)
- [x] Filtro eliminatorio de contacto → score `null`, **no** 0 (y el negocio no se borra)
- [x] Señales del HTML que ya descarga la Fase 2: pixels de publicidad, año de copyright, responsive
- [x] **Probado: `npm run probar:fase4` → 29/29** ✅
- [ ] Reemplazos pendientes: fecha de la última reseña (Places), antigüedad del dominio (RDAP)
- [ ] Capa Claude para los ambiguos — *diferida:* con 9 reglas deterministas puede no hacer falta

**Entregable:** Leads ordenados con su razón. **Esfuerzo:** M · **Estado:** 🟢 lista y probada.

#### Las señales, y qué pasó con las del jefe

| Señal que pidió | Peso | Qué se hizo |
|---|---|---|
| Inversión en ads (Meta Ad Library) | Alto | ✅ **Reemplazada:** pixel de Meta / tag de Google en su propia página. Mismo dato, público, gratis |
| Actividad digital (IG/FB < 30 días) | Alto | ⚠️ **Reemplazo más flojo** (redes visibles + copyright al día) → por eso su peso **baja a Medio** |
| Reseñas activas | Medio | ✅ El número ya sale de Places. La fecha de la última queda pendiente |
| Tamaño (# empleados LinkedIn) | Medio | ✅ **Reemplazada por # sucursales**, que sale gratis de nuestros datos |
| Antigüedad (registro del dominio) | Bajo-medio | 🟡 Regla escrita, RDAP pendiente. Devuelve *indeterminado*, no 0 |
| Accesibilidad de contacto | Filtro | ✅ Es filtro eliminatorio, no puntúa — como pidió |

Tres de sus señales requerían **scrapear Instagram, Facebook o LinkedIn** — el mismo riesgo de baneo
que él mismo descartó. Se reemplazaron por evidencia que está en la página pública del negocio.

#### Los dos ejes, y por qué la media geométrica

Las 6 señales del jefe miden todas lo mismo: **si el negocio puede pagar**. Ninguna medía **si
necesita el producto**. Él confirmó el eje que faltaba al responder que una web fea sube.

Para vender sitios web los dos ejes están **negativamente correlacionados**: quien mantiene su sitio
tiene capacidad pero no necesidad. Por eso se combinan con `√(capacidad × necesidad)` y no sumando —
sumando, un negocio con plata y sitio impecable saldría alto, y ese no compra.

**Medido en la prueba:** con el eje de necesidad, el 1º le saca **26 puntos** al 2º. Sin él, solo
**3 puntos** — La Terraza se vería casi tan buena como El Fogón, y no lo es.

> 🐛 **Bug de diseño que encontró la prueba:** la media geométrica pura **anula** el score si un eje
> da 0 — tres leads quedaron en 0 exacto. Un 0 es un descarte disfrazado (nadie va a mirar un lead
> en 0) y contradice "priorizar, no descartar"; además tres empatados en 0 no tienen orden entre sí.
> Se agregó `PISO_EJE = 10`: ahora esos leads dan 25, 23 y 13 — muy por debajo del que sí necesita,
> pero **ordenados y visibles**.
>
> 🐛 **Segundo bug:** el detector de "su sitio es un Linktree" tenía un regex roto que pedía
> `linktr.ee.ee`. No habría marcado nunca ese caso. Se cambió por una lista explícita de dominios.

---

### Fase 5 · Redacción 🤖
Claude Haiku → primer correo por lead.
- [ ] Servicio `redaccionService`: dado un lead → asunto + cuerpo + CTA
- [ ] Usar un **dato personalizador** del negocio (rating, servicio, ubicación)
- [ ] Guardar en `correos` con `modelo` usado y estado `correo_generado`

**Entregable:** Borrador de correo por lead. **Esfuerzo:** M · **Depende de:** Fase 4
**👉 Al terminar esta fase ya hay un correo real de punta a punta.**

---

### Fase 6 · Panel + revisión 👀
Panel en Vercel para ver/filtrar/aprobar. **El control humano vive aquí.**
- [ ] Panel: listar leads con filtros (categoría, ubicación, con/sin email, estado) y orden por score
- [ ] Vista de revisión del correo: aprobar / editar / descartar antes de enviar
- [ ] Contadores mínimos (leads, con email, pendientes, aprobados) — *sin dashboard pesado*
- [ ] Estados `aprobado` / `descartado_por_humano`

**Entregable:** El operador ve todo y aprueba. **Esfuerzo:** L · **Depende de:** Fase 5

---

### Fase 7 · Automatizar ⏰
Cron diario **incremental** (para aislar errores).
- [ ] Paso 1: cron solo de **descubrimiento**
- [ ] Paso 2: + **contacto**
- [ ] Paso 3: + **verificación + priorización + redacción**
- [ ] El humano sigue revisando en el panel; **el envío nunca se automatiza**

**Entregable:** Corre solo cada día (pasos 1–5); el humano aprueba. **Esfuerzo:** M · **Depende de:** Fase 6

---

# VÍA B — Madurez y trazabilidad

> Lo que casi nadie pone en un scraper. Aquí está el mayor diferenciador.

### B1 · Trazabilidad del dato 🧭
- [ ] Metadata de búsqueda (`busquedas`) — poder repetir sin confundir resultados *(en Fase 0/1)*
- [ ] `origen_del_correo` — evaluar la calidad del dato *(en Fase 2)*
- [ ] `razon` del score — transparencia *(en Fase 4)*
- [ ] Estado en cada etapa del lead — saber exactamente dónde está cada uno

**Entregable:** Cada dato sabe de dónde vino y por qué. **Esfuerzo:** S (va incrustado en Vía A)

### B2 · Calidad del email y protección del dominio 🛡️
- [ ] Verificación (Fase 3) + regla: no se aprueba envío a email `invalido`
- [ ] (Futuro) tasa de rebote objetivo <2%

**Entregable:** No quemamos el dominio. **Esfuerzo:** S · **Depende de:** Fase 3

### B3 · Documentación técnica 📚 (máximo ROI — casi todo es escritura)
- [x] `docs/ARCHITECTURE.md` — capas, regla de dependencia, servicios por herramienta
- [x] `docs/DATABASE.md` — tablas, estados, dedup, los 4 fixes, migraciones
- [ ] `docs/DEPLOYMENT.md` — Vercel, Supabase, cron, variables de entorno
- [ ] `docs/USER_MANUAL.md` — cómo se usa el panel (con la Fase 6)
- [ ] 🔵 **OPCIONAL** · `docs/SECURITY.md` — Ley 81, datos públicos, opt-out, qué NO se recolecta

> **Sobre SECURITY.md:** queda como opcional por decisión del dev — el jefe no lo va a pedir.
> Escribirlo si aparece alguno de estos tres casos: (1) se pide dictamen legal, (2) entra un cliente
> de sector regulado (banca, salud, legal — la Línea 2 del pitch), o (3) llega un reclamo de opt-out.
> El contenido ya está decidido y disperso: la postura legal está en `PROPUESTA-TECNICA.md` §4 y el
> resumen en `docs/ARCHITECTURE.md`. Es juntarlo, no investigarlo.

**Entregable:** Documentación seria. **Esfuerzo:** S-M · **Depende de:** núcleo estable (Fases 0–6)

### B4 · Monitoreo y errores 📈 (versión ligera)
- [ ] Logger de errores propio → tabla `errores`
- [ ] Registro de cada corrida del cron (cuántos negocios, cuántos con email, cuántos fallaron)
- [ ] Página/estado de error amigable en el panel

**Entregable:** Sabes cuándo y por qué falla. **Esfuerzo:** M · **Depende de:** Fase 7

### B5 · QA y pruebas ✅
- [ ] Casos de prueba manuales (descubrir, contacto, verificar, priorizar, redactar, aprobar)
- [ ] Checklist de regresión por cambio
- [ ] Probar el flujo completo con datos reales de Panamá

**Entregable:** "No solo lo construí, validé que funciona." **Esfuerzo:** M · **Depende de:** Fases 1–6

### B6 · Envío profesional 📮 (diferido hasta después de Modo 1)
- [ ] Dominio dedicado + calentamiento (warm-up)
- [ ] Opt-out en cada correo (Ley 81 / CAN-SPAM)
- [ ] Límites de envío diarios · reputación

**Entregable:** Los correos llegan y no caen en spam. **Esfuerzo:** M · **Depende de:** dominio (jefe) · **Estado:** fuera de la tubería, por definir

### B7 · Cumplimiento legal ⚖️
- [ ] Solo datos públicos · sin datos sensibles
- [ ] Registro de tratamiento + base legal (interés legítimo B2B) documentado
- [ ] Opt-out funcional

**Entregable:** Defendible bajo Ley 81. **Esfuerzo:** S · **Depende de:** dictamen legal (recomendado)

---

## Orden recomendado (4 fases)

> Principio: núcleo funcionando de punta a punta ANTES de documentar y automatizar — no se documenta ni se automatiza lo que todavía va a cambiar.

### 🔴 Fase Crítica — el esqueleto
| # | Tarea | Por qué aquí |
|---|---|---|
| **0** | **Hito 0.5 · rebanada fina** (5 negocios → 1 email → 1 borrador) | **PRIMERO y NO opcional.** Ver el flujo caminar en un día enseña más que pulir capas. Absorbe el spike de Places. |
| 1 | **Fase 0 · Cimientos** (estados + modelo de datos) | Sin modelo, todo lo demás improvisa |
| 2 | **Fase 1 · Descubrimiento** (Places API) | Primer dato real; se reutiliza en Modo 2 |

### 🟠 Fase Núcleo — la tubería completa
| # | Tarea | Por qué aquí |
|---|---|---|
| 3 | **Fase 2 · Contacto** (Apify) | El email — el corazón del lead |
| 4 | **Fase 3 · Verificar** | Protege el dominio antes de cualquier envío |
| 5 | **Fase 4 · Priorizar** | Ordenar a quién contactar primero |
| 6 | **Fase 5 · Redacción** | Primer correo real de punta a punta |

### 🟡 Fase Producto — control y confianza
| # | Tarea | Por qué aquí |
|---|---|---|
| 7 | **Fase 6 · Panel + revisión** | El control humano; lo que el operador usa |
| 8 | **B3 · Documentación** | Ahora el núcleo es estable → no se reescribe |
| 9 | **B5 · QA** | Validar todo antes de "entregar" |

### 🟢 Fase Escala — automatizar y crecer
| # | Tarea | Por qué aquí |
|---|---|---|
| 10 | **Fase 7 · Cron incremental** | Corre solo cada día |
| 11 | **B4 · Monitoreo** | Cuando ya hay flujo real que vigilar |
| 12 | **B6 · Envío profesional** | Dominio + warm-up (con el jefe) |
| 13 | **Modo 2 (genérico)** | Add-on: enchufar `cerebroService` al frente del pipeline (~1 día). Ver *"Modo 1 vs Modo 2 — contrato de interfaz"* |
| 14 | **Segundo canal (vacantes)** | Konzerta/Computrabajo vía Apify, para productos de automatización |

**Top 5 que más acercan a "herramienta seria":**
🧭 estados+modelo (Fase 0) · 🔎 descubrimiento (Fase 1) · ✅ verificación (Fase 3) · 👀 panel+revisión (Fase 6) · 📚 documentación (B3).

---

## Criterios de éxito (para que "sistema serio" sea falsable)

El objetivo de arriba —*"esto es un sistema serio"*— es hoy una opinión. Estos criterios lo
vuelven medible. Sin ellos no hay forma de saber si el proyecto funcionó.

| Hito | Criterio de éxito | Cómo se mide |
|---|---|---|
| **Hito 0.5** | Un correo que un humano enviaría **sin reescribirlo entero** | Lo lee el dev y decide. Binario. |
| **Fase 1** | ≥ 50 negocios reales de una categoría, **0 duplicados** | `select count(*), count(distinct place_id) from negocios` |
| **Fase 2** | ≥ 40 % de los negocios con web dan un email utilizable | Es el número que decide si Apify vale lo que cuesta |
| **Fase 3** | Tasa de rebote proyectada < 2 % | Lo reporta el verificador antes de enviar |
| **Fase 4** | El operador está de acuerdo con el orden en 8 de los 10 primeros | Revisión manual del top 10 |
| **Fase 6** | El operador procesa **20 leads en < 10 minutos** | Cronómetro. Si no, el panel estorba. |
| **Fase 7** | 7 corridas seguidas del cron sin intervención manual | Registro de corridas (B4) |
| **Post-B6** | Tasa de respuesta ≥ 3 % en los primeros 200 correos | Recién aquí se puede calibrar el scoring con datos reales |

**Regla:** ningún hito se declara terminado por "ya está el código". Se declara terminado cuando
su criterio se cumple.

---

## Descartado / fuera de alcance (v1)

Buenas ideas, pero **prematuras** para la primera versión (agregar columna en Postgres luego es barato):

- **Historial de versiones del correo** (v1/v2 por lead) → cuando el sistema crezca.
- **Dashboard de estadísticas pesado** → por ahora, contadores mínimos.
- **Fase de enriquecimiento pesado** (horarios, años de actividad, etc.) → capturar solo lo que Places da gratis.
- **Funnel post-envío** (abierto → respondió → cliente) → requiere envío real; llega con B6.
- **CRM externo** (HubSpot) → empezar con vista sobre Supabase.
- **Scraping propio de LinkedIn** → decisión del jefe: descartado.
- **API REST propia** → Supabase ya la expone; capa extra sin valor.

---

## Riesgos

- [ ] **Apify bloquea la Fase 2** → mitigación: arrancar Fases 0–1 con capas gratis + datos de prueba a mano.
- [ ] **El email suele ser genérico** (`info@`) → no prometer "el correo del decisor"; en negocio chico ese buzón es el dueño.
- [ ] **Dominio de envío** → sin warm-up los correos rebotan; por eso el envío se difiere a B6.
- [ ] **Ley 81** → un email público sigue siendo dato personal; opt-out + base legal documentada.
- [ ] **TypeScript es nuevo** para el dev → se aprende construyendo; es parte del valor del proyecto.

---

## Bitácora de avance

| Fecha | Tarea | Avance | Pendiente |
|---|---|---|---|
| 2026-07-25 | — | Roadmap v1 creado. Modo 1 en 8 fases (Vía A) + 7 items de madurez (Vía B), orden en 4 fases, estados del lead definidos, ideas de ChatGPT filtradas (lo que sirve ahora vs. diferido). | Confirmar con el jefe: lista de productos, cuenta de Apify, tipo de CRM. Arrancar **Fase 0** (estados + modelo de datos) con capas gratis. |
| 2026-07-25 | Review v1.1 | 🔧 **Fix de modelado:** la entregabilidad del email vive **solo** en `contactos.estado_verificacion` (estaba duplicada en los estados del lead → riesgo de desincronización). Estados del lead = solo posición en la tubería. **Hito 0.5** promovido a obligatorio y primero (absorbe el spike de Places). | Hacer el **Hito 0.5** (rebanada de 1 día) antes del DDL. |
| 2026-07-25 | Review v1.2 | 🧭 **Modo 2 documentado como contrato de interfaz** (no build paralelo): los dos modos convergen en el mismo pipeline; solo cambia quién llena el `searchSpec`. Añadida la costura genérica a respetar desde Fase 0-1, la secuencia de entrega (Modo 1 → encender Modo 2 ~1 día) y el aviso de que el trabajo escondido es el **segundo canal (vacantes)**, no Modo 2. | Confirmar con el jefe si Modo 1 usa el cerebro (Decisión #2) antes de Fase 0. |
| 2026-07-27 | **v1.5 — Fase 1 probada + limpieza** | 🧪 **Fase 1 completa y probada contra la base real** (`npm run probar:fase1` → 25/25) sin necesitar la llave de Google: el lector de Places se **inyecta**, así que en pruebas entra un fixture con 6 negocios sintéticos que ejercitan los casos borde a propósito (2 sucursales de cadena con el mismo dominio, uno sin web, uno sin rating, uno cerrado permanentemente, respuesta paginada). Se verificó dedup por `place_id`, idempotencia (2ª corrida = 0 duplicados, pero sí refresca rating y reseñas), los fixes (a) y (c) de punta a punta (1 negocio + 2 búsquedas = 1 fila en `negocios`, 2 en `prospecciones` con estados independientes), el troceo por zonas con dedup entre zonas, y que el cerrado permanentemente se guarda pero no se prospecta. · 📐 **Costeo del troceo:** 1–3 llamadas por zona → 24 llamadas por categoría con las 8 zonas de Ciudad de Panamá. · 🗂️ **Git inicializado** (43 archivos, `.env` excluido) — antes no había historial, así que cualquier borrado era irreversible. · 🧹 **Limpieza:** eliminados `flujo-diario.md` (el mismo pipeline estaba en 4 lugares más, y ya decía "solo diseño, no código") e `investigacion/05-claude-redaccion.md` (lo reemplazó código: precios en `core/claude.ts`, prompt en `redaccionService.ts`, costo real medido por el hito). Las 5 referencias colgantes quedaron arregladas. · 🔧 **Corrección de dato:** la propuesta decía "~$0.0026/correo con prompt caching" — no se cumple, el mínimo cacheable de Haiku 4.5 es 4096 tokens y el system prompt ronda 1500. El costo real es $0.0038. | Llaves de API para el Hito 0.5. Con eso, cambiar el fixture por la llamada real es un parámetro. |
| 2026-07-26 | **v1.4 — Fase 0 CERRADA** | ✅ **Esquema aplicado y verificado en Supabase** (proyecto `lrfaulyhdcvtutnzxsae`): 8 migraciones, `npm run verificar` → **40/40**. Los 4 fixes de arquitectura ya no son diseño, son hechos comprobados contra la base real: se verificó que `negocios` no tiene `busqueda_id` ni `estado`, que `correos` no tiene `negocio_id`, que el mismo negocio sostiene dos estados distintos (uno por producto), y que las tres puertas de envío bloquean de verdad — email `pendiente` no es enviable, opt-out por email y por dominio funcionan. · 🐛 **Bug encontrado por la propia verificación:** el trigger de `actualizada_en` usaba `now()`, que en Postgres es la hora de *inicio de transacción* — dentro de una sola transacción no cambiaba, así que el cron de la Fase 7 habría perdido la traza de cuándo avanzó cada lead. Corregido con `clock_timestamp()` en la migración `008`. · 🧪 `npm run verificar` queda como prueba de regresión del modelo (arranque de B5): corre en una transacción que siempre se revierte, seguro contra producción. · 🔑 Llaves de Supabase en formato nuevo (`sb_secret_`/`sb_publishable_`); el código acepta los dos formatos. · 🛡️ Guard en `config.ts`: detecta placeholders `[...]` sin reemplazar y falla con un mensaje claro en vez de un error de autenticación opaco. | **Solo faltan 2 llaves de API** (Places + Claude) para el Hito 0.5. Places necesita facturación conectada al proyecto GCP — eso sí puede requerir al jefe. |
| 2026-07-25 | **v1.3 — diseño congelado + primer código** | 🔧 **4 fixes de arquitectura al modelo de datos**, todos con la misma raíz (`negocios` hacía tres trabajos): **(a)** se quitó `negocios.busqueda_id` — era incompatible con el dedup que este mismo roadmap pedía; **(b)** `correos` ahora cuelga de (prospección, contacto), porque la unidad de envío es el email y las sucursales comparten `info@`; **(c)** el estado de tubería se movió a la nueva tabla `prospecciones` (negocio × búsqueda), porque `enviado` es por-producto, no por-empresa; **(d)** tabla `supresiones` desde la Fase 0 — sin ella el cron re-contacta mañana a quien se dio de baja ayer. · 🧹 **Contradicciones eliminadas:** banner de superado en `04-scoring-encaje.md` (su filtro `<40 → descartar` contradecía "priorizar, no descartar", y sus señales son del canal de vacantes); `diagrama-arquitectura.html` decía que Apify descubre los negocios (lo hace Places); el PPT prometía el canal de vacantes. · 📐 **Jerarquía de documentos** explícita en `ESTADO-ACTUAL-v2.md`. · 📚 **Diseño congelado** en `docs/ARCHITECTURE.md` + `docs/DATABASE.md`. · 💻 **Código:** proyecto Node 24 sin build, 7 migraciones, runner idempotente, `placesService`, `contactoService` (provisional), `redaccionService`, y el **Hito 0.5** completo. Typecheck limpio. · 📊 **Criterios de éxito** por hito. · 🔍 Dos hallazgos nuevos: techo de ~60 resultados por consulta en Places, y el dedup correcto es `place_id` (no dominio+nombre, que colapsa sucursales). | **Conseguir 2 llaves de API** (Places + Claude) y correr el Hito 0.5. Es el único bloqueo real. Luego crear el proyecto Supabase y aplicar las migraciones. |

---

## Decisiones pendientes con el jefe

Ordenadas por qué tan pronto bloquean.

| # | Decisión | Bloquea | Urgencia |
|---|---|---|---|
| **0** | **Llave de Google Places** — necesita **facturación conectada** al proyecto GCP, aun para la capa gratis | **El Hito 0.5 y toda la Fase 1** | 🔴 ahora |
| **0b** | **Llave de Claude** (~$5 en la cuenta de project manager) | El Hito 0.5 y la Fase 5 | 🔴 ahora |
| 1 | **La lista de productos** de Modo 1 | El arranque real (hoy hay un ejemplo de relleno en el Hito 0.5) | 🔴 ahora |
| 2 | **¿Modo 1 usa el cerebro?** ¿La lista trae la categoría, o Claude la razona? | Dónde vive `cerebroService` | 🟠 antes de Fase 1 |
| ~~3~~ | ~~Proyecto Supabase~~ | — | ✅ **resuelto** |
| 4 | **Cuenta de Apify** + crédito | Fase 2 | 🟡 antes de Fase 2 |
| ~~5~~ | ~~¿Scoring contra el producto o contra las 4 líneas?~~ | — | ✅ **Contra el producto** (29 jul) |
| ~~6~~ | ~~¿Se le envía a los `catch_all`?~~ | — | ✅ **Se saltan** (29 jul). Ya era el default: cero código |
| ~~9~~ | ~~¿Se contacta a quien ofuscó su email?~~ | — | ✅ **Sí se contacta** (29 jul). Ya era el default: cero código |
| **10** | **Los pesos del eje NECESIDAD.** Dio los de capacidad como Alto/Medio/Bajo-medio; los de necesidad son propuesta nuestra y están marcados en `scoring/configuracion.ts` | Calibración de Fase 4 | 🟢 no bloquea |
| 7 | **CRM:** vista sobre Supabase (gratis) vs externo (HubSpot) | Fase 6 | 🟢 antes de Fase 6 |
| 8 | **Dominio de envío** dedicado + warm-up | B6 | 🟢 más adelante |
