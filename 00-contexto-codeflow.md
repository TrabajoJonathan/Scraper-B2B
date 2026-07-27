# Contexto — CodeFlow AI

> Fuente: `Codeflow_Pitch (1).html` (pitch de la empresa). Guardado 2026-07-20.
> Este documento es la referencia de contexto para todo el proyecto de investigación del scrapper B2B.

## Qué es CodeFlow AI
Empresa de **IA y automatización para el mercado LATAM**.
Fundadores: **Gabo Caballero** y **Juan Diego**.

**Modelo de negocio interno:** reclutan personas que dirigen IA (con **Claude Code**) para
ejecutar proyectos de clientes. La persona no necesita saber programar; dirige a la IA.
Cobra **35% de todo lo que entrega**, en dólares, sin sueldo fijo. La empresa aporta el
sistema (clientes, playbooks, templates, memoria organizacional) y paga todas las herramientas.

**Stack de herramientas ya en uso (pagado por la empresa):**
Claude / Claude Code · Supabase · Vercel · costos de API.

## Las 5 líneas de negocio (esto es lo que venden)

| # | Línea | Ticket | Notas | ¿B2B / relevante al scrapper? |
|---|-------|--------|-------|-------------------------------|
| 1 | **Implementación empresarial** | $3K–15K/proyecto + recurrente | Bot de cotización WhatsApp, dashboard de ventas en vivo, integración contabilidad↔inventario, reportes automáticos | ✅ Sí — motor principal de revenue |
| 2 | **IA segura y local** | $5K–20K setup + fee mensual | IA on-premise, datos nunca salen del cliente. Target: bancos, clínicas, estudios legales | ✅ Sí — alto valor, target regulado |
| 3 | **Agencia web premium** | $1.5K–6K/sitio | Sitios con animaciones 3D. **Ya incluye un scrapper de Google Maps que encuentra clientes** | ✅ Sí — ya hacen scraping aquí |
| 4 | **Clipping** | Recurrente desde día 1 | Pipeline de clips de video monetizando | ⚠️ B2C/creadores — poco relevante a lead-gen B2B |
| 5 | **Tours 3D inmobiliarios** | Alto ticket · desde Q4 2026 | Video de celular → recorrido 3D navegable | ⚠️ B2B (inmobiliarias) pero futuro |

**Distribución de revenue proyectado (mediana anual):**
Implementación $83K · Web $60K · IA local $42K · Clipping $21K · Tours 3D $13K.
Ninguna línea supera el 40% del total (estrategia de diversificación).

## Implicaciones para el scrapper B2B de clientes
- El **scoring de encaje** debe puntuar cada lead contra las líneas **vendibles B2B**: 1, 2, 3 y (a futuro) 5.
  Clipping (4) es B2C y probablemente queda fuera del scoring B2B.
- **Mercado = LATAM**, con foco explícito en **Panamá** (el brief menciona Computrabajo Panamá).
  → La cobertura de proveedores de enriquecimiento US (Apollo, Clearbit) será BAJA en LatAm; hay que ponderar fuentes locales.
- Ya usan Claude → la etapa de **redacción de correos con Claude** encaja con su stack actual.
- Ya tienen experiencia de scraping (Google Maps) → hay base técnica interna.
- Como CodeFlow paga las herramientas y opera a escala, el costo por lead y el build-vs-buy importan.

## Señales de compra por línea (borrador inicial para el scoring)
- **Implementación empresarial:** PYMEs/empresas con procesos manuales, ventas por WhatsApp, uso de Excel para inventario/contabilidad, publican vacantes de "asistente administrativo", "data entry", "atención al cliente".
- **IA segura y local:** sector regulado (banca, salud, legal) que no puede mandar datos a la nube; empresas con requisitos de privacidad/compliance.
- **Agencia web premium:** empresas con web pobre o inexistente, marcas premium, inmobiliarias, restaurantes de alto nivel.
- **Tours 3D:** inmobiliarias, desarrolladores, agentes de bienes raíces (Q4 2026+).
