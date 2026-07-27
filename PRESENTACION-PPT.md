# Codeflow — Buscador de leads B2B
### Guion completo para la presentación (PPT)

> **Cómo usar este doc:** cada `## Slide` es una diapositiva. Las viñetas van en la slide (cortas). El bloque `🎤 Para presentar` es lo que dices tú en voz — no lo pongas en la slide, es tu guion.
> Donde diga *[insertar imagen]*, exporta el diagrama de `diagrama-arquitectura.html` o de Figma como PNG y pégalo.
> Fase: **solo investigación/diseño — no código todavía.**

---

## Slide 1 — Portada

**Buscador inteligente de clientes B2B**
Herramienta interna de prospección · Codeflow

Jonathan Quintero · julio 2026

> 🎤 Para presentar: "Esto es la investigación y el diseño de cómo construiríamos el buscador de clientes. No es el código todavía — es el plano de cómo funcionaría."

---

## Slide 2 — El problema

- Buscar clientes a mano **quita mucho tiempo**.
- Hay que encontrar el negocio, su contacto, y escribirle — uno por uno.
- Se pierde tiempo en prospectos que **no encajan** con lo que vendemos.

> 🎤 Para presentar: "Hoy conseguir clientes es manual y lento. La idea es automatizar la parte aburrida —buscar y armar la lista— para dedicar el tiempo a vender."

---

## Slide 3 — La solución en una frase

**Tú dices qué producto quieres vender → la herramienta encuentra los negocios que lo comprarían, saca su contacto y arma la campaña de correo (que un humano revisa antes de enviar).**

> 🎤 Para presentar: "En una frase: le dices qué vendes, y te devuelve una lista de clientes potenciales con su contacto y un correo listo para revisar."

---

## Slide 4 — Dos modos

**El router pregunta: "¿Qué producto quieres vender hoy?"**

- **Modo 1 — Codeflow:** vender un producto de nuestra lista.
- **Modo 2 — Genérico:** escribes cualquier producto y la IA busca **a quién se lo venderías**.
  - "automatización legal" → **firmas de abogados**
  - "pan" → **restaurantes / hoteles** (no panaderías: ellas *hacen* pan, no lo compran)

> 🎤 Para presentar: "Funciona para cualquier producto. Lo clave: busca al que COMPRA el producto, no al que lo produce. Por eso 'pan' no lleva a panaderías, sino a quien compra pan."

---

## Slide 5 — El flujo diario (cómo se ve cada corrida)

```
Cada día (automático)
   ↓
Buscar: "Abogados · Panamá"
   ↓
Extraer negocios        (Google Maps Places API oficial)
   ↓
Extraer correos         (Apify entra a la web del negocio)
   ↓
Guardar en PostgreSQL   (Supabase)
   ↓
Enviar al CRM
   ↓
Crear campaña de email  (Claude redacta)
   ↓
Revisión humana → Envío
```

> 🎤 Para presentar: "Cada día corre solo los pasos de armar la lista. El envío nunca es automático: una persona revisa antes. Así no mandamos correos sin control."

---

## Slide 6 — Cómo funciona por dentro (arquitectura)

*[insertar imagen del diagrama de arquitectura]*

- Dos modos entran a un mismo pipeline.
- **El canal de búsqueda depende del PRODUCTO**, no del modo:
  - Vendes **web / local** → buscamos en **Google Maps**. ✅ **Esto es lo que construimos primero.**
  - Vendes **automatización** → buscamos en **vacantes de empleo**. 🟡 *Diseñado, pero es un segundo canal aparte.*

> 🎤 Para presentar: "El diseño soporta dos canales, y la regla es que el canal lo decide el producto, no el modo. Ahora una aclaración importante de alcance: **lo que voy a construir es el canal de Google Maps**. El de vacantes está diseñado —una vacante de 'asistente que contesta WhatsApp' es una empresa que puedo automatizar— pero es un build aparte, no viene incluido. No quiero prometer dos canales y entregar uno y medio."

---

## Slide 7 — Cómo recolectamos (dos herramientas, dos trabajos)

- **Descubrir negocios → Google Maps Places API (oficial):** categoría + ubicación → nombre, dirección, teléfono, web, rating. Estructurada, legal, capa gratis. *(No trae email.)*
- **Sacar el email → Apify:** entra al **sitio web** de cada negocio y extrae el contacto público (email, teléfono, redes).
- Apify también podría correr los scrapers de **vacantes** (Konzerta, Computrabajo) — *cuando se construya ese segundo canal.*

> 🎤 Para presentar: "Dos herramientas, dos trabajos. Para DESCUBRIR uso la API oficial de Google Maps —lo que usted mencionó—: estructurada y legal, pero no trae el email. Para el EMAIL, Apify entra a la web del negocio y lo saca de ahí. Existe un scraper de Apify que raspa Maps directo, pero prefiero la API oficial para descubrir: más limpio y es lo que usted pidió."

---

## Slide 8 — Cómo conseguimos el contacto

- Sale del **propio sitio web** del negocio (lo saca Apify).
- Suele ser un buzón **genérico** (`info@`, `contacto@`) — en negocio local pequeño, ese buzón *es* el dueño.
- **Verificamos** el email antes de enviar (que no rebote).
- Proveedores tipo Apollo/Hunter = **plan B** (no cubren bien Panamá).

> 🎤 Para presentar: "Para un negocio local panameño, su propia web es la mejor fuente de contacto. Y siempre verificamos el correo antes de enviar, para no quemar nuestro dominio."

---

## Slide 9 — Stack técnico

| Pieza | Herramienta |
|---|---|
| Descubrir negocios | **Google Maps Places API** (oficial) |
| Email (de la web del negocio) | **Apify** |
| Base de datos | **PostgreSQL / Supabase** |
| Redacción de correos | **Claude Haiku** (IA) |
| Panel / CRM | **Vercel** (o CRM externo — por definir) |

> 🎤 Para presentar: "Usa lo que la empresa ya paga: Claude, Supabase, Vercel. Poco costo nuevo."

---

## Slide 10 — Costos

- **IA (Claude): ~$5** de crédito para empezar (cuenta de project manager).
- **Apify:** suscripción aparte (~$29–49/mes) — corre los scrapers.
- **Google Maps Places API:** por request, con capa gratis (los primeros son gratis).
- Redactar un correo: **~medio centavo**. Costo por lead: **centavos**.

> 🎤 Para presentar: "Con $5 de IA arranca la parte de IA. Apify y la API de Maps van aparte, pero también son baratas —centavos por negocio. Lo importante: no es caro. Y ojo, no es 'todo con $5': la IA sí, las otras herramientas aparte."

---

## Slide 11 — Legal: solo datos públicos

- **Solo información de acceso público**, respetando las normativas (Ley 81 Panamá).
- **NO scrapeamos LinkedIn** — va contra sus reglas y arriesga baneos/demandas (casos: hiQ, Proxycurl).
- El contacto sale de Google Maps y de la web pública del negocio.

> 🎤 Para presentar: "Nos mantenemos en datos públicos. LinkedIn lo dejamos fuera a propósito, por riesgo legal y de baneo. Un matiz honesto: un email, aunque sea público, sigue siendo dato personal bajo la Ley 81 — 'público' no es 'exento'. Es bajo riesgo y defendible, pero lo manejamos con cuidado (opt-out, solo B2B)."

---

## Slide 12 — Decisiones ya tomadas

- ✅ Dos modos (Codeflow / genérico).
- ✅ Canal según el producto (vacantes o Google Maps).
- ✅ Contacto desde la web del negocio (Apify).
- ✅ LinkedIn fuera · IA = Claude Haiku · datos públicos.
- ✅ Al arrancar: **priorizar, no descartar** (casi todo negocio sirve).
- ✅ **Alcance v1: Modo 1 sobre Google Maps, de punta a punta.** Lo demás queda diseñado y documentado.

> 🎤 Para presentar: "Estas ya las decidimos contigo. El diseño está claro y está congelado. La última es la más importante: definimos un alcance chico y cerrado para la v1, para poder entregarlo completo en vez de entregar cuatro cosas a medias."

---

## Slide 13 — Preguntas para definir contigo

1. **El "CRM":** ¿tabla filtrable en Supabase (gratis) o CRM externo tipo HubSpot (integración + costo)?
2. **Modo 1:** ¿la lista de productos ya trae las categorías a buscar, o la IA las razona?
3. **Envío:** confirmar dominio dedicado + calentamiento (para que los correos lleguen).

> 🎤 Para presentar: "Necesito que me confirmes estas tres para cerrar el diseño. No las adivino."

---

## Slide 14 — Próximos pasos

1. Cerrar las 3 preguntas de arriba.
2. Conseguir accesos: cuenta de Apify + crédito de Claude.
3. Construir un **MVP**: un solo modo, un solo canal, de punta a punta.
4. Probar con leads reales de Panamá antes de escalar.

> 🎤 Para presentar: "Con eso definido, arranco un MVP pequeño que funcione de principio a fin, y de ahí escalamos."

---

*El plan y el alcance mandan en `ROADMAP.md`. Contexto del negocio: `ESTADO-ACTUAL-v2.md`. Diagrama visual: `diagrama-arquitectura.html`. Investigación detallada (proveedores/precios/legal): `PROPUESTA-TECNICA.md`.*
