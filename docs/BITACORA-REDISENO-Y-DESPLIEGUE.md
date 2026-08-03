# Bitácora: rediseño visual, llaves reales y despliegue

Cubre del **2026-07-31** (rediseño visual) al **2026-08-03** (llaves reales +
corrección de Apify). Complementa a `docs/ARCHITECTURE.md` (el diseño
congelado) y `ROADMAP.md` (el plan): esto es el registro de **qué se decidió
después de congelar el diseño, y por qué**.

---

## Resumen ejecutivo

**¿Funciona hoy?** Sí, verificado ahora mismo:

- **179/179 comprobaciones automáticas en verde** (42 de esquema + 26+31+23+29+28
  de las Fases 1–5)
- `typecheck` limpio en los dos `tsconfig`
- `next build` limpio
- Login probado con las credenciales reales: `Restaurante El Trapiche`,
  `Fosters`, `La Cevicheria Panama` — negocios que existen, con reseñas reales
- Las llaves de **Google Places** y **Anthropic (Claude)** están puestas y
  confirmadas funcionando

**¿Qué falta?** Dos llaves (**Apify** — resultó no hacer falta, ver más abajo —
y **MillionVerifier**), y publicar en Vercel (preparado, no ejecutado).

---

## 1. Rediseño visual (2026-07-31)

El pedido: que las pantallas dijeran *"esto lo hizo una empresa de software"*,
no solo *"esto funciona"*. Se tocó **únicamente** `app/` — cero cambios en
`src/`, verificado con `git diff --stat -- src/` antes de cada commit.

Decisiones centrales:

- **Grises neutros, no azules.** El fondo viejo (`#0c1a29`) tenía tinte azul; eso
  es lo que lo hacía ver como panel de admin viejo en vez de Linear/Vercel. Se
  pasó a `#0B0C0E` con una escala de grises sin matiz.
- **El color solo donde previene un error.** Antes "en cola" y "buscando" iban en
  amarillo — estados normales pintados como advertencia. El amarillo quedó
  reservado para dos cosas: el aviso de **datos sintéticos** y el de **buzón
  compartido**. El score dejó de tener tres colores (se distingue por peso de
  texto, no por matiz): la tabla ya está ordenada por score, así que el color
  repetía esa información y le robaba fuerza al color que sí avisa de un
  problema real.
- **Revisión: de tarjetas apiladas a dos columnas tipo Gmail.** No se podía
  comparar dos sucursales sin recordar el correo de cinco pantallas arriba, y
  "Aprobar" aparecía veinte veces hasta dejar de leerse como una decisión. La
  selección quedó en la URL (`?correo=<id>`), igual que los filtros de
  `/leads`; como al aprobar el correo sale de la cola, aprobar avanza solo al
  siguiente.
- **"Leads por estado" → embudo**, en el orden real del pipeline
  (`src/dominio/estados.ts`), no en el orden que devolvía el `group by`.

Commit: `c2f39cd`.

---

## 2. Login con identidad de marca (2026-08-01)

El login había quedado como la pantalla más floja: una clase CSS y el
formulario centrado, sin marca ni profundidad.

**Referencia real, no una descripción de ella.** Se clonó el repo
`bossjona19/Sistema-de-adopcion` (Proyecto OMEGA) y se leyó su CSS en vez de
adivinar por la captura. Eso encontró detalles que a ojo no se ven:

- Bordes de inputs a **1.5px**, no 1px — a 1px sobre fondo oscuro el borde casi
  desaparece.
- Bloque de marca de tres pisos: tile con icono / nombre / bajada.
- La nota de acceso restringido va al **pie**, no como bajada del título — es
  letra chica, no lo primero que hay que leer.

**Lo que no se copió, y por qué:** OMEGA usa tarjeta blanca porque OMEGA es una
app *clara* con sidebar azul — su login y su panel comparten el mismo azul. Acá
el panel es oscuro; una tarjeta blanca habría dado más golpe en la entrada pero
al segundo clic se sentiría como dos aplicaciones distintas. Se resolvió con
una tarjeta oscura **elevada** (sombra + una línea de luz de 1px arriba) y el
mismo tile de degradado repetido en el sidebar del panel — el hilo de color que
hace que entrar no se sienta como cambiar de app.

Se agregó también una regla de disciplina de color: `--acento-2` (violeta)
existe **solo** para decoración (login, tile, botón de entrar) y nunca para
comunicar estado. Si aparece en una píldora o en un botón del panel, "Aprobar"
deja de destacar sobre "Editar".

Commit: `d4e9c14`.

---

## 3. Preparar Vercel (2026-08-01)

Se encontraron y corrigieron tres cosas antes de publicar:

1. **Registro público abierto en Supabase** (`disable_signup: false`) y
   `DOMINIO_PERMITIDO` ausente — con la URL pública, cualquiera se creaba una
   cuenta y entraba. El usuario cerró el registro desde el panel de Supabase;
   `DOMINIO_PERMITIDO=code-flow-ai.com` se puso en el `.env`.
2. **`.gitignore` insuficiente.** Ignoraba `.env` y `.env.local` a secas, lo que
   dejaba pasar un `.env.vercel` recién creado con las llaves de producción. Se
   cambió a `.env*` con excepción de `.env.example`. Commit `bf90fcb`.
3. **`DATABASE_URL` con el puerto equivocado para serverless.** El puerto 5432
   (pooler en modo sesión) reserva la conexión completa; una función que
   arranca y muere cientos de veces agotaría el cupo. Para Vercel se generó
   `.env.vercel` (gitignored) con el puerto **6543** (modo transacción). Se
   probó el patrón real del cron (`begin` + `for update skip locked` +
   `commit`) contra los dos puertos: los dos funcionan.

**No se completó el despliegue**: `vercel login` falló en esta máquina. Se
recomendó importar el repo directamente desde vercel.com/new (no requiere el
CLI) y pegar el contenido de `.env.vercel`.

---

## 4. El cron: por qué se desactivó (2026-08-02)

Decisión del jefe, transmitida en la reunión del 2026-08-01: el plan Hobby de
Vercel limita los cron a **una vez por día**, y un paso por día no sirve para
un pipeline de seis pasos. Pro no entraba en el presupuesto todavía.

Se sacó el bloque `crons` de `vercel.json` y nada más — la ruta `/api/cron`
sigue intacta y sigue exigiendo `Authorization: Bearer $CRON_SECRET`; que no
haya cron programado no la deja abierta. Mientras tanto el pipeline avanza con
`npm run cron` en local, que pega a la misma base de Supabase y por lo tanto
también hace avanzar las corridas creadas desde la web ya desplegada. Para
reactivarlo alcanza con devolver el bloque a `vercel.json`.

Commit: `dcd6f5a`.

---

## 5. Llegan las llaves reales (2026-08-02/03)

El 2026-08-02 llegaron `GOOGLE_PLACES_API_KEY` y `ANTHROPIC_API_KEY`. Se
probó cada una por separado antes de gastar en una corrida completa:

```
Places   → 403 "Places API (New) has not been used in project ... or is disabled"
Claude   → OK, modelo claude-opus-5, respondió, cobró 14 tokens
```

El 403 de Places no era la llave: era que la API "(New)" no estaba habilitada
en el proyecto de Google Cloud (`499026192413`). Google exige habilitarla
explícitamente y tener facturación vinculada, aunque el uso caiga en la capa
gratis. Se habilitó desde la consola y la misma llave empezó a funcionar,
devolviendo negocios reales de Bella Vista: *Restaurante El Trapiche* (1729
reseñas), *La Strega Ristorante* (1872), *Filomena Cucina di Mare* (1337), etc.

---

## 6. El caso Apify: cómo se encontró y por qué se notó tarde

Esta es la sección que se pidió documentar en detalle.

### 6.1 — El diseño original era razonable, y está escrito en `docs/ARCHITECTURE.md`

Desde que se congeló la arquitectura (2026-07-25), el documento dice
explícitamente:

> *"`servicios/contactoService.ts` hoy hace `fetch` + regex — provisional y
> feo, a propósito. Cuando llegue la cuenta de Apify se reescribe **ese
> archivo y nada más**."*

O sea: Apify siempre fue **un reemplazo futuro** de una implementación
provisional, no una dependencia que el sistema ya necesitara para operar. Esa
distinción es la raíz de todo lo que sigue.

### 6.2 — Dónde se coló el bug

`pipelineService.ts` tenía una función, `dependenciasAutomaticas()`, que
decidía real-vs-fixture **para las cuatro integraciones a la vez**:

```ts
// como era antes
if (faltantes.length === 0) {
  // TODO real: Places, contacto, verificador, Claude
} else {
  // TODO fixture, sin importar CUÁL llave faltaba
}
```

Mientras el estado del proyecto era "cero llaves" o "las cuatro llaves", este
atajo nunca se notaba: daba exactamente el mismo resultado que decidir
integración por integración. El atajo y el diseño correcto eran
indistinguibles **hasta que llegaran algunas llaves sí y otras no** — que es
justo lo que pasó el 2026-08-02.

### 6.3 — Cómo se descubrió

Se corrió una corrida real de punta a punta con las llaves de Places y Claude
ya puestas y confirmadas funcionando por separado. Resultado:

```
NEGOCIOS: 6
  Restaurante El Fogón Panameño,   | score 51 | info@elfogonpanameno.com.pa
  Cafetería La Terraza (Vía Espa   | score 25 | reservas@laterraza.com.pa
  ...
```

Esos son los nombres del **fixture**, no de Google Maps — la prueba directa de
la API (sección 5) había devuelto *El Trapiche*, *La Strega*, etc. La llave
funcionaba; el pipeline la estaba ignorando. Sin ese contraste — probar la API
suelta primero, y la corrida completa después — el problema no se habría visto:
una corrida con 6 negocios inventados y una con 6 negocios reales se leen
igual de "normales" si no se conoce de antemano qué nombres son cuáles.

### 6.4 — Por qué se notó tarde y no antes

Tres razones concretas, no una sola:

1. **Nadie había tenido llaves parciales antes.** Todo el desarrollo, desde la
   Fase 0 hasta el 2026-08-01, corrió con cero llaves. El atajo todo-o-nada era
   invisible por construcción: no había ningún estado del `.env` que lo
   expusiera.
2. **`APIFY_TOKEN` nunca gobernó nada real**, así que no había ninguna señal de
   alerta esperando esa llave. `contactoService.ts` siempre usó `fetch`
   simple — Apify jamás se conectó, ni en un spike. Gatear por esa variable no
   protegía ninguna funcionalidad; solo imitaba la forma de un gate real.
3. **El síntoma no rompía nada.** La corrida terminaba `completada`, con
   `con_fixtures = true` y su aviso amarillo visible. Todo el sistema de
   auditoría diseñado para "avisar cuando hay datos falsos" funcionaba
   perfectamente — el problema era que avisaba con el estado equivocado
   (decía "todo es de prueba" cuando en realidad dos de las cuatro
   integraciones ya eran reales). Un bug que no genera un error, sino un aviso
   demasiado conservador, no se nota mirando logs: hay que comparar el
   resultado contra lo que se sabe independientemente que es correcto.

### 6.5 — La corrección

Tres cambios, mismo commit (`20a84bc`, 2026-08-03):

- **`dependenciasAutomaticas()` decide por integración.** Cada llave gobierna
  solo su propia pieza. El `fetch` de sitios web se ligó al **origen de los
  negocios** (real o fixture) y no a `APIFY_TOKEN`: los negocios de fixture
  tienen URLs que no existen, así que bajarlas de verdad no serviría de nada;
  los negocios reales sí tienen webs reales que hay que bajar de verdad.
- **Migración 016 — `corridas.fixtures_en text[]`.** Antes solo existía
  `con_fixtures boolean`. Con integraciones mezclables, una corrida puede tener
  negocios reales con verificación simulada — y eso es **más peligroso** que
  tenerlo todo inventado, no menos: el negocio real le presta credibilidad al
  dato falso. El aviso de la pantalla de corrida ahora dice, en lenguaje de
  empleado, exactamente qué parte no hay que creerle (p. ej. *"la
  verificación de entregabilidad"*) en vez de un genérico "esto es de
  prueba".
- **`sembrar-demo.ts` no marcaba su propia corrida como sintética.** Ese
  script no pasa por `tick()` — llama a los servicios uno por uno para
  simular el recorrido del cron —, que era el único lugar que escribía
  `con_fixtures`. La corrida de demo, la **más** inventada de todas, era la
  única sin el aviso. Se corrigió marcándola a mano al crearla.

### 6.6 — Verificado después del fix

```
Corrida Obarrio   : 60 negocios REALES · 13 con correo REAL · fixtures: solo verificación
Corrida Bella Vista: 60 negocios REALES · 3 con correo REAL  · fixtures: contacto + verificación
Corrida demo       : 6 negocios de fixture · 2 borradores · fixtures: las tres partes (correcto: es 100% demo)
```

Los 13 correos reales de Obarrio no generaron borrador — **eso es correcto, no
un bug nuevo**: sin `MILLIONVERIFIER_API_KEY`, el verificador de fixture
responde "no sé" para un correo que no reconoce, y la regla de negocio dice
*"no sé" ≠ "no cumple"*: el sistema no redacta a quien no pudo verificar, para
no arriesgar quemar el dominio de envío. Es la misma regla que decidió el
jefe en la Fase 3, funcionando tal como se diseñó.

---

## 7. Estado verificado ahora mismo (2026-08-03)

| Verificación | Resultado |
|---|---|
| `npm run verificar` (esquema) | OK — 42/42 |
| `npm run probar:fase1..5` | OK — 26+31+23+29+28 = 137/137 |
| `npm run typecheck` | limpio, los dos `tsconfig` |
| `next build` | limpio |
| `GOOGLE_PLACES_API_KEY` | puesta y funcionando |
| `ANTHROPIC_API_KEY` | puesta y funcionando |
| `APIFY_TOKEN` | vacía — **no hace falta**, ver §6 |
| `MILLIONVERIFIER_API_KEY` | vacía — bloquea la redacción de correos reales |
| Cuentas en Supabase Auth | una: `projectmanager6@code-flow-ai.com` |
| Servidor local | `http://localhost:3000`, respondiendo |
| Despliegue a Vercel | preparado, no ejecutado |

**179 comprobaciones automáticas en total, 0 fallos.**

---

## 8. Cómo funciona hoy, de punta a punta

Con las llaves actuales (Places + Claude reales; verificador y, si se usara,
Apify en fixture):

```
1. Encargar   → un empleado llena "producto / categoría / ubicación" en /corridas/nueva
2. descubrir  → Google Places (REAL) trae hasta 60 negocios de la zona
3. contacto   → fetch (REAL, sin llave) baja cada sitio y extrae el email
4. verificar  → MillionVerifier SIMULADO: sin la llave, responde "no sé" para
                 cualquier correo que no esté en el fixture de 3 emails conocidos
5. priorizar  → el motor de scoring (REAL, siempre; no depende de ninguna
                 llave externa) puntúa por capacidad × necesidad
6. redactar   → Claude (REAL) escribe un borrador — pero SOLO para los
                 correos que el paso 4 marcó como verificados
7. Revisar    → un humano aprueba o descarta en /revision. Nada se envía solo.
```

El cuello de botella real hoy es el paso 4. Con `MILLIONVERIFIER_API_KEY`
puesta, los 13+ correos reales que ya se están extrayendo en cada corrida
empezarían a generar borradores de verdad.

Sin esa llave, la corrida sigue siendo útil para la demo: negocios reales,
scores reales, correos de contacto reales — y el aviso amarillo explica con
precisión qué falta, en vez de descalificar toda la corrida como "de
prueba".

---

## 9. Pendientes

- [ ] `MILLIONVERIFIER_API_KEY` — es la única llave que hoy limita que las
      corridas reales generen borradores
- [ ] Publicar en Vercel (import desde vercel.com/new + pegar `.env.vercel`)
- [ ] Decidir si se recrea una cuenta de prueba en Supabase Auth (hoy solo
      existe `projectmanager6@code-flow-ai.com`)
- [ ] Revocar el token de GitHub `ghp_2CVl...` usado para el push inicial
      (ya no hace falta)
- [ ] Borrar el cliente OAuth de Google que se compartió por chat durante el
      Hito 0.5
- ~~`APIFY_TOKEN`~~ — retirado de la lista de bloqueos: no gobierna ninguna
  funcionalidad existente (§6.1, §6.4)
