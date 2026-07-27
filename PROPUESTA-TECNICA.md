# Propuesta técnica — Scrapper de clientes B2B para CodeFlow AI

> ⚠️ **DISEÑO PARCIALMENTE SUPERADO — leer primero `ESTADO-ACTUAL-v2.md`.**
> Este archivo es el **respaldo de investigación** (proveedores, precios, riesgos legales — sigue válido).
> Pero algunas decisiones de diseño cambiaron tras hablar con el jefe (21 jul 2026):
> el canal depende del **producto**, no del modo; el scoring **prioriza**, no descarta;
> LinkedIn queda **fuera** como scraping propio (no como canal primario preagregado).
> Ante cualquier contradicción, manda `ESTADO-ACTUAL-v2.md`.

**Fase:** investigación / diseño. **No es la construcción** — el build es un proyecto posterior.
**Fecha:** 2026-07-20 · **Mercado:** LATAM, foco Panamá · **Volumen objetivo:** piloto 100–300 leads/mes → escala ~1.000/mes.
**Stack existente de la empresa:** Claude/Claude Code, Supabase, Vercel.

> **Nota de fiabilidad.** Los datos de precios y límites provienen de investigación web (jul-2026).
> Muchos precios de scraping/enriquecimiento cambian seguido y varios benchmarks de "tasa de acierto"
> los publican los propios competidores. Trátalos como rangos orientativos y confírmalos antes de contratar.
> Las cifras de límites de LinkedIn NO son oficiales (LinkedIn no las publica).

---

## 0. Resumen ejecutivo (TL;DR)

1. **Invertir el orden clásico del pipeline.** En vez de arrancar por LinkedIn (alto riesgo legal, caro,
   frágil), arrancar por **scraping de vacantes** en portales locales (Konzerta/Computrabajo). Es
   **legal, barato, panameño y perfecto para el pitch**: una vacante de "asistente administrativo" o
   "atención al cliente por WhatsApp" es evidencia directa de un proceso que la **Línea 1 (Implementación)**
   puede automatizar. La señal de compra viene con el lead.
2. **Evitar el scraping propio de LinkedIn logueado.** Viola el ToS §8.2 y LinkedIn gana por contrato/tort
   (hiQ pagó $500K; Proxycurl **cerró en jul-2025** tras ser demandado). Si se necesita dato de LinkedIn,
   **comprarlo preagregado** (Bright Data, ~$0.0025/registro) — el comprador nunca scrapea.
3. **Ningún proveedor global de enriquecimiento cubre bien Panamá.** Combinar **Apollo** (mejor cobertura
   LATAM entre los globales) + **cascada (waterfall)** + **verificación** de email. Konzerta ya trae
   contactos en la propia vacante, lo que reduce esta dependencia para leads panameños.
4. **Scoring híbrido de 2 capas:** reglas baratas primero (filtran <40), Claude solo para los que pasan.
5. **Redacción con Claude Haiku 4.5:** ~$0.0038/correo. El LLM es el costo más barato del pipeline.
6. **Estimación del build:** MVP funcional en **~2–3 semanas**, pipeline completo en **~6–8 semanas**
   (un operador dirigiendo Claude Code). **Costo operativo lean: ~$120/mes** a 1.000 leads/mes.

---

## 1. Arquitectura del pipeline (5 etapas + descubrimiento por vacantes)

```
[A] DESCUBRIMIENTO           [B] EXTRACCIÓN         [C] ENRIQUECIMIENTO      [D] SCORING            [E] REDACCIÓN
 ├─ Vacantes (Konzerta,       datos empresa/          email + teléfono         reglas → filtro       Claude Haiku
 │  Computrabajo, JobSpy)     contacto/vacante        (Apollo→cascada→verif.)  → Claude clasifica    correo + asunto
 └─ LinkedIn (datos            normalizados            (Konzerta ya trae         → línea + ángulo      + CTA
    preagregados, opcional)                            contacto para PA)                                    │
                                                                                                            ▼
                    Supabase (dedup, estado, histórico) ◄──────────────────────────────────  revisión humana → envío
```

**Dos canales de entrada:**
- **Canal 1 — Vacantes (recomendado como primario).** Empresas que publican roles automatizables.
  El lead llega con su dolor identificado. Encaja sobre todo con Línea 1 (Implementación).
- **Canal 2 — LinkedIn/Sales Navigator (secundario, opcional).** Para segmentar por cargo/industria
  cuando se busca un perfil concreto de decisor (útil para Líneas 2 y 3). Aquí está el grueso del riesgo legal.

---

## 2. Herramientas y librerías evaluadas por etapa

### Etapa 1 — Búsqueda / descubrimiento

**Canal vacantes (bajo riesgo, foco Panamá):**

| Herramienta | Precio | Qué da | Nota |
|---|---|---|---|
| **Konzerta (Apify `blackfalcondata/bumeran-scraper`)** | ~$1/1.000 | Vacantes PA + **email/teléfono/redes de la empresa** | ⭐ Mejor opción Panamá: anti-bot bajo, trae contacto |
| **Computrabajo (Apify `stealth_mode/...`)** | desde $1.50/1.000 | Vacantes 19 países LatAm + métricas (postulaciones, urgencia) | Anti-bot bajo, HTTP simple + proxy ante 403 |
| **JobSpy** (OSS, `pip install python-jobspy`) | **gratis** | Indeed/LinkedIn/Glassdoor/Google Jobs | Indeed sin rate-limit; LinkedIn limita ~pág. 10 |
| SerpApi Google Jobs | $25/mes (1.000) | Capa de descubrimiento cross-portal | Opcional |
| TheirStack | $59/mes (1.500 créd.) | Vacantes + **technographics** (stack de la empresa) | Para escalar; señal de madurez tech |

**Canal LinkedIn (ver riesgos en §4):**

| Enfoque | Herramienta | Precio | Riesgo |
|---|---|---|---|
| **Datos preagregados (recomendado)** | Bright Data LinkedIn Dataset | ~$0.0025/registro (mín. $250/100K) | **Bajo** — no scrapeas tú |
| Datos preagregados | Coresignal / People Data Labs | $0.005–0.28/registro | Bajo |
| Scraping SaaS | Evaboot / PhantomBuster / Apify | $9–160/mes + créditos | Medio-alto (requiere Sales Nav) |
| Scraping propio | Playwright + **Patchright/nodriver** + proxy residencial | infra propia | **Alto** (ToS, baneo) |

> **Proxycurl ya NO existe** (cerró 4-jul-2025 tras demanda de LinkedIn). No diseñar nada sobre él.

**Sobre librerías de navegador (si se hiciera scraping propio):** en 2026 Playwright/Puppeteer vainilla
son detectables. Las variantes con mejor tasa de evasión en benchmark independiente (mayo-2026):
**nodriver** (~90%), **Patchright** (drop-in de Playwright, ~81%), **Camoufox** (motor Firefox, mejor
contra DataDome). Toda herramienta open-source necesita re-parcheo tras cada actualización de Chrome.

### Etapa 2 — Extracción de datos

**Campos extraíbles:**
- De vacante: título, descripción, empresa, ubicación, salario, seniority, (a veces) contacto.
- De perfil/Sales Nav: nombre, cargo, empresa (tamaño, industria), ubicación, historial. **El email NO
  está en el perfil** — requiere enriquecimiento (Etapa 3).

**Almacenamiento:** Supabase (ya en el stack). Tablas `empresas`, `contactos`, `vacantes`, `leads`,
`correos`. Deduplicación por dominio + nombre normalizado (los nombres compuestos hispanos rompen
muchos algoritmos — normalizar con cuidado).

### Etapa 3 — Enriquecimiento de correo → ver comparación completa en §3.

### Etapa 4 — Scoring → ver diseño completo en `investigacion/04-scoring-encaje.md` y §5.

### Etapa 5 — Redacción con Claude → ver §6 (ya implementado: `src/servicios/redaccionService.ts`).

---

## 3. Proveedores de enriquecimiento comparados

> **Hallazgo crítico:** ningún proveedor global cubre bien **Panamá**. Solo **Apollo** tiene cobertura
> LATAM demostrable (y limitada a grandes ciudades de BR/MX). El dato serio de Panamá viene de registros
> locales (RUC / Registro Público / InfobelPRO), no de estas herramientas.

### Precio y API

| Proveedor | Plan de entrada | ≈ Costo/email | API desde | Cobertura LATAM |
|---|---|---|---|---|
| **Apollo.io** | Basic $49/usuario/mes | ~$0.20 overage | Organization $119 | **Media** ⭐ (la mejor global) |
| **Hunter.io** | $49/mes (2.000 cr) | ~$0.025 | Todos los planes | Baja-media |
| **Dropcontact** | ~€79/mes (dato en conflicto) | ~€0.024 | Business+ | Baja (fuerte FR) |
| **Findymail** | $99/mes (5.000+5.000) | ~$0.021 | Todos | Baja (fuerte EU) |
| **Snov.io** | $39/mes (1.000) | ~$0.039 | Incluida | Baja |
| **Prospeo** | $39–49/mes | ~$0.01–0.049 | Incluida | Incierta |
| **Icypeas** | desde $19/mes | ~$0.019 | Todos | — (99% precisión) |
| **Datagma** | $49/mes | 1 cr/email | Todos (incl. free) | Baja (fuerte UE) |
| **Lusha** | $49.90/mes | 1 cr/email; móvil=10 | Pro+ | Baja-media |
| **RocketReach** | $69/mes | por lookup | Ultimate $209 | Baja |
| **Clearbit/Breeze (HubSpot)** | add-on $45/mes | $0.10/enriq. | Vía HubSpot | Baja |
| **ContactOut** | $99/mes | no publicado | Team/custom | Baja |

### Tasa de acierto (benchmarks — con conflicto de interés, usar como rango)

**Realidad, no marketing:** un mono-fuente bueno rinde **40–55% de emails usables** / 55–70% cobertura
bruta. Un **waterfall** sube la cobertura a **70–87%**. Los reclamos de "95–99%" son de vendedor.

- **Benchmark Anymail 2026** (5.000 decision-makers, US/UK/FR/DE) — cobertura / precisión:
  FullEnrich (waterfall) 87% / 96% · Findymail 71% / 96% · Dropcontact 69% / 93% · **Apollo 68% / 91%** ·
  **Hunter 58% / 86%** · Icypeas 49% / **99%** · **Snov 46% / 75%**.
- **Benchmark Dropcontact 2025** (tasa "usable" = hallados − rebotes − dominio erróneo):
  Dropcontact 55% · FullEnrich 48% · Findymail 40% · Hunter 33% (rebote 11%).

**No existe** un benchmark verdaderamente independiente de muestra grande. El comparativo de "Reverse
Contact" que se buscó **no aplica** (es reverse-lookup, otra categoría); Warmy/Warmforge mide *inbox
placement* de warm-up, no hit rate.

### Waterfall (cascada) + verificación

Encadena varios proveedores; solo pagas por resultado. Regla: **<1.000 contactos/mes → mono-fuente
preciso gana; por encima → waterfall se justifica** (tu caso al escalar).

| Herramienta waterfall | Costo/1.000 emails usables |
|---|---|
| **Enrow** | ~$9.5 (el más barato serio) |
| Findymail | ~$19 (garantía <5% rebote) |
| **BetterContact** (20+ fuentes) | ~$47 |
| FullEnrich (15+) | ~$64 |
| Clay (150+, incluye móvil+firmográficos) | $0.70–$3.75/contacto completo (caro; sobra si solo quieres email) |

**Verificación** (baja rebote de 5–10% a <1%, descarta ~20% de emails): **MillionVerifier** (~$0.0037/email,
el más barato) o **Bouncer** (~$0.008, el más equilibrado). Estándar de cold email: rebote <2%.

### Prueba gratis
Casi todos ofrecen free tier: Hunter 50 cr/mes, Apollo ~50–100/mes, Snov 50 trial, Findymail 10,
Datagma 90/año, Prospeo 75–100/mes, Dropcontact 50 trial. **Recomendación: pilotar con free tiers sobre
una muestra real de leads panameños antes de contratar** — es la única forma de medir cobertura Panamá.

### GDPR
- **Dropcontact** es el más limpio por diseño (genera y valida en vivo, sin BD de personas comprada) →
  mejor para prospección hacia UE/España.
- Los de BD acumulada (Apollo, Hunter, Snov, Lusha, RocketReach…) se apoyan en interés legítimo + opt-out.
  **Lusha** fue investigada por el garante italiano.

**Stack de enriquecimiento recomendado:** Apollo (base LATAM) → cascada (**Enrow** barato o
**BetterContact**) → **MillionVerifier** (verificación final). Para leads panameños, aprovechar primero
el contacto que **Konzerta** ya entrega. Complementar la base local con datos de registros de Panamá.

---

## 4. Riesgos legales y técnicos

### 4.1 Riesgo por fuente (de menor a mayor)

| Fuente | Riesgo legal | Por qué |
|---|---|---|
| **Vacantes públicas (sin login)** | **BAJO** | Datos de empresa, no personales → fuera de RGPD/Ley 81. hiQ y Meta v. Bright Data: scrapear datos públicos *sin login* no viola CFAA. |
| **Datos LinkedIn preagregados (comprar)** | **BAJO** | El comprador nunca scrapea; Bright Data/Coresignal/PDL operan sobre este modelo legal. |
| **Enriquecimiento de contactos (email/tel de personas)** | **MEDIO** | Aquí sí tratas **datos personales** → RGPD (si tocas UE) + Ley 81 Panamá. Requiere base legal (interés legítimo documentado) + opt-out. |
| **Scraping propio de LinkedIn logueado** | **ALTO** | Viola User Agreement §8.2. LinkedIn gana por contrato/tort aunque el CFAA no aplique. |

### 4.2 LinkedIn — ToS, legal y bloqueo

- **ToS §8.2:** prohíbe expresamente scraping, crawlers, elusión de límites, copia/redistribución y bots.
  Obliga a cualquiera con cuenta → incluso scrapear datos públicos logueado es **incumplimiento de contrato**.
- **Precedentes:** *hiQ v. LinkedIn* — hiQ ganó el punto CFAA pero **perdió por ToS: sentencia de $500K +
  interdicto** (2022). *Mantheos*, *Proxycurl* — LinkedIn ganó/forzó acuerdo en todos. **Proxycurl cerró
  en jul-2025.**
- **GDPR (si tocas UE/España):** "público" ≠ "libre para scrapear". Nombre/cargo son datos personales.
  Enforcement real: **KASPR €240K** (2024) por scrapear contactos de LinkedIn; **Clearview €30.5M**.
- **Límites (NO oficiales, estimaciones a las que aplicar amplio margen):** ~500 vistas de perfil/día
  (free) / ~2.000 (Sales Nav); ~100 invitaciones de conexión/semana (pacing seguro 15–25/día); tope de
  2.500 resultados por búsqueda en Sales Nav *(este sí verificado)*.
- **Detección:** fingerprint TLS/JS, CDP `Runtime.enable`, reputación de IP, patrones de comportamiento.
  LinkedIn restringe sobre todo cuando la automatización se combina con **resultados dañinos** (reportes
  de spam, baja aceptación).
- **Baneo:** escala de restricción (24h → 3-14 días con verificación de ID → permanente). La automatización
  es citada como el disparador nº1 de restricciones 2025-2026. Baneo permanente = pérdida de la cuenta y
  re-detección rápida de cuentas nuevas (fingerprint/IP).

### 4.3 Panamá — Ley 81 de 2019
Modelo tipo RGPD, autoridad **ANTAI**, sanciones **$1.000–$10.000**. Las vacantes no aplican; los
contactos personales sí. **Recomendable un dictamen legal local** antes de operar a escala.

### 4.4 Riesgo técnico
- Portales locales (Konzerta/Computrabajo): anti-bot **bajo** → objetivos fáciles y estables.
- Indeed/LinkedIn: **Cloudflare/DataDome** → requieren proxies residenciales y stealth; frágil.
- Cold email: la **entregabilidad** depende de dominio dedicado + calentamiento (warm-up) + volumen +
  reputación. Cumplir CAN-SPAM (US) y opt-out claro. El LLM no arregla la entregabilidad.

### 4.5 Postura recomendada (dado "recomiéndame tú")
**Camino de bajo riesgo, recomendado para CodeFlow:**
1. **Descubrimiento por vacantes** (legal, panameño, con señal de compra). Es el motor.
2. **Enriquecimiento** tratando los contactos como dato personal bajo interés legítimo B2B documentado
   (registro de tratamiento, opt-out en cada correo, no tocar datos sensibles).
3. **Datos de LinkedIn solo comprados preagregados** (Bright Data) si se necesita segmentar por decisor.
4. **NO** montar scraping propio de LinkedIn logueado en la v1. Si más adelante se quiere, hacerlo dentro
   de la sesión del propio usuario (extensión), volumen conservador, y asumiendo el riesgo de baneo.

---

## 5. Scoring de encaje (resumen — detalle en `investigacion/04-scoring-encaje.md`)

Modelo híbrido de 2 capas contra las 4 líneas B2B (1 Implementación, 2 IA local, 3 Web, 5 Tours 3D):
- **Capa A (reglas, costo ~0):** suma pesos por señales (título de vacante, sector, tamaño, presencia web,
  ubicación). Filtro: `best_score < 40` → descartar (ahorra costo de LLM).
- **Capa B (Claude Haiku, solo si pasa):** clasifica línea recomendada + confianza + ángulo de venta +
  dato personalizador (que alimenta la Etapa 5).
- `score_final = 0.6·reglas + 0.4·(100·confianza)`. Umbral de contacto ≥ 55, calibrable con datos reales.

Señal más fuerte = **vacante de rol automatizable** (asistente admin, data entry, atención al cliente por
WhatsApp, cotizador). Coincide con la literatura (OIT: 26–38% de empleos LatAm expuestos a IA generativa;
WEF: data entry y admin, los de mayor declive). Para clasificar la vacante: LLM zero-shot → normaliza a
ocupación ESCO/O*NET (multilingüe, sirve para español) → cruce con índice de exposición → override por keywords.

---

## 6. Redacción con Claude — **YA IMPLEMENTADO**

> Esta sección era investigación; ahora es código. Precios verificados contra el catálogo el
> 2026-07-25 y codificados en `src/core/claude.ts`; el prompt vive en `src/servicios/redaccionService.ts`;
> el costo real por correo lo imprime `npm run hito05`.

- **Modelo default: Claude Haiku 4.5** ($1.00 / $5.00 por millón de tokens) → ~**$0.0038/correo**.
  A 1.000 correos/mes ≈ **$3.8/mes**. **Sonnet 5** ($3/$15, promo $2/$10 hasta 2026-08-31) solo para
  cuentas de alto ticket (Línea 2, $5–20K).
- Salida estructurada (`asunto`, `cuerpo`, `cta`, `dato_personalizador_usado`) vía `output_config.format`:
  la API garantiza la forma, no hay que parsear texto libre.
- **Human-in-the-loop siempre**, no solo los primeros 50. Es decisión del proyecto, no una etapa.
- Batch API (−50%) disponible para lotes no urgentes.

> ⚠️ **Corrección a la estimación original.** La versión previa decía "~$0.0026 con prompt caching".
> **Eso no se cumple:** el mínimo cacheable de Haiku 4.5 es **4096 tokens** y nuestro system prompt
> ronda los 1500, así que el caché nunca se activa (sin error — simplemente no cachea). El costo real
> es $0.0038. La diferencia es despreciable en dinero ($1/mes), pero el número correcto es el que va
> al jefe. Si el system prompt llegara a pasar los 4096 tokens, ahí sí conviene activarlo.

---

## 7. Estimación de tiempo y costo del build

### 7.1 Tiempo (un operador dirigiendo Claude Code)

| Fase | Alcance | Estimación |
|---|---|---|
| **MVP** | Vacantes (Konzerta/Computrabajo/JobSpy) → Supabase → scoring por reglas → correo con Claude → revisión manual | **~2–3 semanas** |
| + Enriquecimiento | Apollo + cascada + verificación, dedup, manejo de contactos | +1–1.5 sem |
| + Scoring con LLM | Capa B (clasificación Claude), calibración | +1 sem |
| + LinkedIn (datos comprados) | Integrar Bright Data dataset como segundo canal | +1 sem |
| + Operación | Dashboard, estado de leads, setup de dominio/warm-up de envío, opt-out | +1.5–2 sem |
| **Pipeline completo** | Todo lo anterior | **~6–8 semanas** |

### 7.2 Costo operativo mensual (a ~1.000 leads/mes)

| Concepto | Lean (recomendado) | Completo (con Sales Nav + proxies) |
|---|---|---|
| Scraping vacantes (Konzerta+Computrabajo) | ~$5 | ~$5 |
| JobSpy (Indeed/LinkedIn) | gratis | gratis |
| Plataforma Apify | ~$39 | ~$49 |
| LinkedIn datos preagregados (Bright Data) | — | ~$3 (1.000 registros) |
| Apollo (enriquecimiento base) | ~$49 | ~$99 |
| Cascada (Enrow/BetterContact) | ~$20 | ~$47 |
| Verificación (MillionVerifier) | ~$5 | ~$5 |
| Claude (redacción, Haiku) | ~$3 | ~$3 |
| Sales Navigator | — | ~$99 |
| Proxies residenciales (si scraping LinkedIn) | — | ~$50–150 |
| **Total aprox.** | **~$120/mes** | **~$310–410/mes** |
| **Costo por lead all-in** | **~$0.12** | **~$0.31–0.41** |

*El costo de infra de cómputo/hosting (Vercel/Supabase) es marginal a este volumen y ya está en el stack.*

### 7.3 Costos de una sola vez / setup
- Dominios de envío dedicados + warm-up (semanas 1–4, herramienta de warm-up ~$20–50/mes temporal).
- Dictamen legal local (Ley 81) — recomendado, costo variable.

---

## 8. Recomendación de stack final

| Etapa | Recomendación |
|---|---|
| **Descubrimiento** | **Vacantes primero:** Konzerta (Apify) + Computrabajo (Apify) + JobSpy (Indeed). LinkedIn solo vía **Bright Data preagregado** si se necesita segmentar decisores. |
| **Extracción/almacenamiento** | Scrapers/actores → **Supabase** (dedup por dominio+nombre normalizado). |
| **Enriquecimiento** | **Apollo** (base LATAM) → cascada **Enrow/BetterContact** → verificación **MillionVerifier**. Konzerta ya trae contacto en PA. Pilotar con free tiers antes de contratar. |
| **Scoring** | Híbrido: reglas (filtro <40) → **Claude Haiku** clasifica línea + ángulo. |
| **Redacción** | **Claude Haiku 4.5** (Sonnet 5 para alto ticket), salida estructurada, human-in-the-loop inicial. |
| **Orquestación/UI** | **Vercel** (dashboard de leads y revisión de correos). |
| **Envío** | Dominio dedicado + warm-up + opt-out (fuera del alcance del scrapper, pero necesario). |

**Por qué este stack encaja con CodeFlow:** usa lo que ya pagan (Claude, Supabase, Vercel); el canal de
vacantes es legalmente defendible y produce leads con dolor pre-identificado que alimentan directamente la
Línea 1 (su motor de revenue); el costo por lead es bajo (~$0.12) y escalable; y evita el riesgo mayor
(baneo/demanda por scraping de LinkedIn) sin renunciar a datos de LinkedIn cuando hacen falta (comprándolos).

---

## 9. Riesgos abiertos y próximos pasos antes del build

1. **Validar cobertura Panamá** de Apollo y del actor de Konzerta con una corrida de prueba real (free tiers).
   Ningún proveedor la garantiza por escrito.
2. **Dictamen legal Ley 81 / interés legítimo** para el enriquecimiento de contactos.
3. **Confirmar precios** de Apollo/Enrow/BetterContact/verificadores en las webs oficiales (varios venían de
   fuentes secundarias con pricing renderizado en JS).
4. **Definir política de envío** (dominios, warm-up, límites diarios, opt-out) — condiciona la entregabilidad.
5. **Calibrar pesos del scoring** tras los primeros ~200 correos con la tasa de respuesta real.

---

### Anexos (en `investigacion/`)
- `04-scoring-encaje.md` — diseño detallado del scoring y señales por línea.
- ~~`05-claude-redaccion.md`~~ — eliminado: lo reemplazó código. Precios en `src/core/claude.ts`,
  prompt en `src/servicios/redaccionService.ts`, costo real medido por `npm run hito05`. Ver §6.
- `00-contexto-codeflow.md` — perfil de la empresa (del pitch).
