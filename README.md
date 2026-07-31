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

## Ver el panel funcionando (sin ninguna credencial externa)

```bash
npm run sembrar     # llena la base con una corrida de demo (datos de fixture)
npm run dev         # http://localhost:3000
npm run sembrar -- borrar
```

Los datos son **sintéticos**: negocios inventados con perfiles de señales elegidos a mano.
Sirven para ver la interfaz y mostrarla; **no** para sacar conclusiones del mercado.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la app web (Next.js) en `localhost:3000` |
| `npm run build` | Build de producción de la app |
| `npm run sembrar` | Datos de demo para ver el panel · `-- borrar` los quita |
| `npm run hito05` | La rebanada fina de punta a punta. No guarda nada, no envía nada. |
| `npm run migrar` | Aplica las migraciones pendientes. Registra en `_migraciones`. |
| `npm run verificar` | Regresión del **modelo** contra la base real (42 comprobaciones). Todo se revierte: seguro contra producción. |
| `npm run probar:fase1..5` | Cada fase de punta a punta con fixtures contra la base real. **Sin credenciales externas.** Limpian lo que crean. |
| `npm run typecheck` | Las **dos** configuraciones de TS (app + scripts) |

**Total: 179 comprobaciones.** Correr `npm run verificar` después de cada cambio de esquema.

> **Dos `tsconfig` a propósito.** `tsconfig.json` es de la app (Next, `moduleResolution: bundler`);
> `tsconfig.scripts.json` es de los servicios y scripts (Node 24 nativo, `nodenext`,
> `erasableSyntaxOnly`). Son runtimes con reglas incompatibles: con solo `nodenext`, TS no resuelve
> `next/link`; con solo `bundler`, Node no puede ejecutar los `.ts` directamente. Si algo pasa la
> config de la app pero falla en la de scripts, **gana la de scripts**: el pipeline corre sobre Node.

**Correr `npm run verificar` después de cada cambio de esquema.** No comprueba que las tablas
existan: comprueba que las restricciones *muerden* — que un `place_id` duplicado se rechaza, que
un email sin verificar no aparece como enviable, que el opt-out por dominio funciona.

> Node 24 ejecuta TypeScript directamente borrando los tipos. Por eso no hay
> `dist/` ni bundler: `tsc` solo revisa. Consecuencias: los imports llevan
> extensión `.ts`, y no se puede usar `enum` ni `namespace` (el tsconfig lo
> hace fallar temprano con `erasableSyntaxOnly`).

## Estructura

```
app/                 la app web (Next.js, se despliega en Vercel)
  componentes/       piezas de interfaz
  lib/               server actions + el suplente de autenticación
  corridas/ leads/ revision/
src/
  dominio/           tipos y estados · CERO dependencias
  core/              un archivo por herramienta externa
  servicios/         traducción herramienta↔dominio · aquí viven los prompts
  fixtures/          datos sintéticos para probar sin credenciales
  scripts/           puntos de entrada ejecutables
supabase/
  migraciones/       001..013 · el esquema
docs/                ARCHITECTURE.md y DATABASE.md · diseño congelado
```

**Regla de dependencia:** `app / scripts → servicios → core → dominio`. Nunca al revés.

Que la app web haya sido **andamiaje y no reescritura** es la prueba de que la regla
sirvió: los servicios ya estaban escritos para ser llamados desde cualquier lado, y los
scripts de prueba eran solo el primer llamador. Las Server Actions son el segundo.

Cada herramienta externa vive detrás de **su propio servicio**, para poder cambiarla sin
tocar el resto. (Cuando llegue Apify se reescribe `servicios/contactoService.ts`, nada más.)

> ⚠️ **Un componente de cliente (`'use client'`) nunca debe importar de `src/servicios/`.**
> Arrastraría `pg` y las variables de entorno al navegador. El build falla si pasa —
> que es donde debe fallar.

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
