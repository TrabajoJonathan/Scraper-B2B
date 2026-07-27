# Buscador de leads B2B — Codeflow

Herramienta interna de prospección. Le dices qué producto quieres vender y
encuentra negocios que lo comprarían, saca su contacto público, los ordena por
encaje y redacta un primer correo — **que un humano aprueba antes de enviar**.

**Alcance v1:** Modo 1 (lista del jefe) sobre canal Google Maps, de punta a punta.

---

## Arrancar

```bash
npm install
cp .env.example .env      # y llenar las llaves (el archivo dice de dónde saca cada una)
npm run hito05            # la rebanada fina: 5 negocios → 1 email → 1 borrador
```

Para el Hito 0.5 hacen falta **dos llaves**:

| Llave | De dónde | Costo |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | console.cloud.google.com → habilitar **Places API (New)** → Credenciales | capa gratis por SKU (verificar cupos) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | ~$0.004 por correo |

Para persistir (Fase 0 completa) hace falta además un proyecto Supabase y
`DATABASE_URL`, y entonces:

```bash
npm run migrar            # aplica supabase/migraciones/ en orden, idempotente
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run hito05` | La rebanada fina de punta a punta. No guarda nada, no envía nada. |
| `npm run migrar` | Aplica las migraciones pendientes. Registra en `_migraciones`. |
| `npm run verificar` | Prueba de regresión del modelo contra la base real (40 comprobaciones). Todo se revierte: seguro contra producción. |
| `npm run probar:fase1` | Fase 1 de punta a punta con datos de fixture contra la base real (25 comprobaciones). **No necesita llave de Google.** Limpia lo que crea. |
| `npm run typecheck` | `tsc --noEmit`. **No hay paso de build.** |

**Correr `npm run verificar` después de cada cambio de esquema.** No comprueba que las tablas
existan: comprueba que las restricciones *muerden* — que un `place_id` duplicado se rechaza, que
un email sin verificar no aparece como enviable, que el opt-out por dominio funciona.

> Node 24 ejecuta TypeScript directamente borrando los tipos. Por eso no hay
> `dist/` ni bundler: `tsc` solo revisa. Consecuencias: los imports llevan
> extensión `.ts`, y no se puede usar `enum` ni `namespace` (el tsconfig lo
> hace fallar temprano con `erasableSyntaxOnly`).

## Estructura

```
src/
  dominio/     tipos y estados · CERO dependencias
  core/        un archivo por herramienta externa (places, claude, supabase, config)
  servicios/   traducción herramienta↔dominio · aquí viven los prompts
  scripts/     puntos de entrada ejecutables
supabase/
  migraciones/ 001..007 · el esquema, congelado
docs/          ARCHITECTURE.md y DATABASE.md · diseño congelado
```

**Regla de dependencia:** `scripts → servicios → core → dominio`. Nunca al revés.
Cada herramienta externa vive detrás de **su propio servicio**, para poder
cambiarla sin tocar el resto. (Prueba: cuando llegue Apify se reescribe
`servicios/contactoService.ts` y nada más.)

## Documentación

| Quiero saber… | Leer |
|---|---|
| Qué se construye y en qué orden | `ROADMAP.md` |
| Cómo está armado y por qué | `docs/ARCHITECTURE.md` |
| El modelo de datos y los 4 fixes | `docs/DATABASE.md` |
| Contexto del negocio y decisiones del jefe | `ESTADO-ACTUAL-v2.md` |
| Proveedores, precios, riesgo legal | `PROPUESTA-TECNICA.md` + `investigacion/` |
| Material para presentar | `PRESENTACION-PPT.md`, `diagrama-arquitectura.html` |

## Reglas que no se re-discuten

- **Solo datos públicos.** Ficha de Google Maps + la web que el negocio publica.
- **Revisión humana antes de enviar. Siempre.** El cron arma la lista; el humano aprueba.
- **Priorizar, no descartar.** El scoring ordena; no hay umbral de corte.
- **Sin scraping propio de LinkedIn.** Decisión del jefe.
- **Opt-out funcional** desde el día 1 (tabla `supresiones`), no diferido.
