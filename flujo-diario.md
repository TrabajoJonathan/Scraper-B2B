# Codeflow — Flujo diario del buscador de leads

> Vista simple y lineal (para presentar). Es el mismo sistema del diagrama de arquitectura,
> contado como una tubería de arriba hacia abajo.

```
        ┌──────────────────────────────────┐
        │   CADA DÍA · automático (cron) 🔁 │
        └────────────────┬─────────────────┘
                         ▼
        ┌──────────────────────────────────┐
        │  1. BUSCAR                        │
        │  categoría + ubicación            │
        │  ej: "Abogados · Panamá"          │
        └────────────────┬─────────────────┘
                         ▼
        ┌──────────────────────────────────┐
        │  2. EXTRAER NEGOCIOS              │
        │  Google Maps Places API (oficial) │
        │  (nombre, web, teléfono, rating)  │
        └────────────────┬─────────────────┘
                         ▼
        ┌──────────────────────────────────┐
        │  3. EXTRAER CORREOS              │
        │  Apify analiza el sitio web       │
        │  → email, teléfono, redes         │
        │  (solo datos públicos)            │
        └────────────────┬─────────────────┘
                         ▼
        ┌──────────────────────────────────┐
        │  4. GUARDAR EN POSTGRESQL         │
        │  Supabase (= PostgreSQL)          │
        │  sin duplicados                   │
        └────────────────┬─────────────────┘
                         ▼
        ┌──────────────────────────────────┐
        │  5. ENVIAR AL CRM                │
        │  gestionar leads en un solo lugar │
        │  (visualizar, filtrar, ordenar)   │
        └────────────────┬─────────────────┘
                         ▼
        ┌──────────────────────────────────┐
        │  6. CREAR CAMPAÑA DE EMAIL        │
        │  Claude Haiku redacta el correo   │
        └────────────────┬─────────────────┘
                         ▼
        ┌──────────────────────────────────┐
        │  7. REVISIÓN HUMANA → ENVÍO 👀    │
        │  nadie envía sin revisar          │
        └──────────────────────────────────┘
```

## Notas clave

- **Todo con datos públicos** — no se scrapea LinkedIn; el contacto sale del propio sitio web del negocio (vía Apify).
- **La IA (Claude Haiku)** solo redacta la campaña; es barata (~medio centavo por correo).
- **Al arrancar no filtramos duro** — casi todo negocio es cliente potencial; el CRM ayuda a ordenar a quién contactar primero.

## Dos pendientes a tener en el radar

1. **Revisión humana antes de enviar** (paso 7): no dejar que la campaña salga sola → protege el dominio y respeta al cliente.
2. **Configurar el dominio de envío** (calentamiento / warm-up): sin eso, los correos rebotan y se quema la reputación. Va fuera de esta tubería, pero es necesario para que los correos lleguen.

---

*Fase: solo diseño, no código. Diagrama de arquitectura completo (con los dos modos y el canal por producto): `diagrama-arquitectura.html`. Contexto completo: `ESTADO-ACTUAL-v2.md`.*
