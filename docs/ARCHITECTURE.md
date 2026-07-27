# Arquitectura — **DISEÑO CONGELADO**

**Fuente de verdad de la arquitectura.** Congelado 2026-07-25.
Modelo de datos: `docs/DATABASE.md` · Plan y alcance: `ROADMAP.md`

---

## Alcance v1 (lo que se construye)

**Modo 1 sobre canal Google Maps, de punta a punta.** Nada más.

Lo demás está diseñado y documentado, pero **no está en el alcance**:
Modo 2 (add-on de ~1 día sobre el mismo canal), canal de vacantes (build
aparte), CRM externo, envío real.

---

## Las capas y la regla de dependencia

```
scripts / (futuro) rutas y panel
        │
        ▼
   servicios/          una carpeta = una herramienta externa detrás de un servicio
        │
        ▼
     core/             clientes crudos (HTTP, SDK). No conoce el dominio.
        │
        ▼
   dominio/            tipos y estados. CERO dependencias.
```

**Las flechas nunca van al revés.** `core/places.ts` no sabe que existe
`placesService`; `dominio/` no importa nada de nadie.

| Carpeta | Qué vive ahí | Qué NO |
|---|---|---|
| `src/dominio/` | Tipos, estados, reglas puras | Nada de I/O, nada de librerías |
| `src/core/` | Un archivo por herramienta: `places`, `claude`, `supabase`, `config` | Prompts, normalización, decisiones de negocio |
| `src/servicios/` | Traducción herramienta↔dominio, orquestación de una etapa, **los prompts** | Nombres de campos de la API cruda fuera de su propio servicio |
| `src/scripts/` | Puntos de entrada ejecutables | Lógica reutilizable |

### Por qué importa: la prueba de Apify

`servicios/contactoService.ts` hoy hace `fetch` + regex — provisional y feo, a
propósito. Cuando llegue la cuenta de Apify se reescribe **ese archivo y nada
más**, porque la firma `extraerContacto(sitioWeb, dominio)` no cambia. Eso es
exactamente lo que compra la regla de dependencia.

Lo mismo aplica a `placesService`: es el **único** lugar del proyecto que sabe
que un campo de Google se llama `userRatingCount`. Cambiar de proveedor de
descubrimiento es reescribir un archivo.

---

## La costura Modo 1 / Modo 2

Los dos modos convergen en el mismo pipeline. Lo único que cambia es **quién
llena el `searchSpec`**:

```
Modo 1 · lista del jefe ─────────────┐
                                     ├──► mismo pipeline
Modo 2 · producto libre ─► CEREBRO ──┘
```

```ts
type SearchSpec = { producto, categoria, ubicacion, canal }
```

**El pipeline consume un `searchSpec` y es ciego a quién lo generó.** En la base
esto queda como `busquedas.fuente` (`'lista_jefe'` | `'cerebro'`).

**Regla:** nunca hardcodear "la entrada es la lista del jefe" dentro del
pipeline. Encender el Modo 2 = enchufar `cerebroService` al frente.

> **El trabajo escondido no es Modo 2 — es el segundo canal.** Modo 2 sobre
> Google Maps es barato. Modo 2 que rutea a **vacantes** ya es otro build.

---

## Herramienta por etapa

| Etapa | Herramienta | Servicio | Estado |
|---|---|---|---|
| Descubrir negocios | Google Places API (New) | `placesService` | ✅ escrito |
| Extraer contacto | Apify (hoy: `fetch` + regex) | `contactoService` | 🟡 provisional |
| Verificar email | MillionVerifier | `verificarService` | ⬜ Fase 3 |
| Priorizar | reglas + Claude Haiku | `scoringService` | ⬜ Fase 4 |
| Redactar | Claude Haiku 4.5 | `redaccionService` | ✅ escrito |
| Persistir | Supabase (PostgreSQL) | `core/supabase` | ✅ escrito |
| Panel + revisión | Vercel | — | ⬜ Fase 6 |
| Automatizar | Vercel Cron / `pg_cron` | — | ⬜ Fase 7 |
| Enviar | dominio dedicado + warm-up | — | ⬜ Vía B6, diferido |

---

## Decisiones técnicas que ya no se re-discuten

**Node 24 con TypeScript nativo, sin paso de build.** Node ejecuta `.ts`
directamente borrando los tipos. `tsc` solo revisa tipos (`npm run typecheck`).
Menos herramientas que aprender — relevante porque TypeScript es nuevo para el
dev. Consecuencia: los imports llevan extensión `.ts` y no se puede usar `enum`
ni `namespace` (`erasableSyntaxOnly` en el tsconfig lo hace fallar temprano).

**Places API oficial para descubrir, Apify para extraer.** Dos herramientas,
dos trabajos. Existe un scraper de Apify que raspa Maps directo, pero la API
oficial es más limpia y es lo que pidió el jefe. Places **no trae email**; de
ahí Apify.

**Techo de Places: ~60 resultados por consulta** (20 por página × 3 páginas).
Para volumen hay que trocear por zona y subcategoría. No es un detalle de
implementación: es diseño de la Fase 1.

**Haiku 4.5 por defecto**, Sonnet 5 solo para alto ticket. Salida estructurada
(`output_config.format`) en vez de parsear texto libre. Dos avisos concretos:
Haiku 4.5 **no acepta** `output_config.effort` (da error), y su mínimo cacheable
es 4096 tokens — con un system prompt de ~1500 el prompt caching **no se activa**,
así que no se pide.

**Sin scraping propio de LinkedIn.** Decisión del jefe: riesgo de baneo/legal.

**El envío nunca se automatiza.** El cron arma la lista; un humano aprueba.
Las tres puertas de envío están en la base de datos (`v_correos_enviables`),
no solo en el código del panel, para que no se puedan olvidar.

---

## Legal (resumen; detalle en `PROPUESTA-TECNICA.md` §4)

- **Solo datos públicos**: la ficha de Google Maps y la web que el propio
  negocio publica.
- Un email de empresa **sigue siendo dato personal** bajo la Ley 81 de Panamá.
  "Público" no es "exento". Base legal: interés legítimo B2B, documentado.
- **Opt-out funcional** desde la Fase 0 (tabla `supresiones`), no diferido.
- Sin datos sensibles. Sin scraping de perfiles.
- Recomendado: dictamen legal local antes de operar a escala.
