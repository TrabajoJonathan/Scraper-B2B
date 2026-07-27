# Hito 4 — Diseño del scoring de encaje (en papel)

> ⚠️ **DISEÑO PARCIALMENTE SUPERADO — leer `ROADMAP.md` y `ESTADO-ACTUAL-v2.md` primero.**
>
> Este archivo sigue siendo **investigación válida**: las señales de compra por línea de negocio
> y el patrón híbrido (reglas baratas → LLM solo para los ambiguos) se mantienen. Pero **tres cosas
> cambiaron y NO deben implementarse como están escritas aquí**:
>
> 1. **El filtro `best_score < 40 → descartar` está DESCARTADO.** La regla del proyecto es
>    **priorizar, no descartar** (decisión del jefe: al arrancar casi todo negocio es cliente
>    potencial). No hay umbral de corte. El scoring **ordena**. Lo mismo aplica al
>    `score_final ≥ 55` del final del documento.
>
> 2. **Las señales de este documento son del canal VACANTES, no de Google Maps.** La señal más
>    pesada de aquí ("vacante de rol reemplazable, +25") y los campos que pide capturar (sector,
>    tamaño de empresa, cargo del contacto, texto de la vacante) **no los devuelve Places API**.
>    El canal que se está construyendo es Google Maps, y sus señales disponibles son otras:
>    tiene web, calidad de la web, rating, nº de reseñas, email corporativo, ubicación.
>    Ver `ROADMAP.md` → Fase 4.
>
> 3. **Modo 1 puntúa contra UN producto de la lista del jefe, no contra las 4 líneas del pitch.**
>    La taxonomía Línea 1/2/3/5 de este documento aplicaría al Modo 2 o a un router de producto
>    futuro — no al Modo 1 que se está construyendo. Ver *Decisiones pendientes* #5 del roadmap.
>
> Ante cualquier contradicción, manda `ROADMAP.md`.

Objetivo: dado un lead (empresa + contacto + señales), producir un puntaje 0–100 de encaje
contra cada una de las 4 líneas B2B de CodeFlow, y un "mejor encaje" con la línea ganadora.
El scoring decide (a) si vale la pena contactar y (b) qué línea/ángulo usar en el correo.

## Las 4 líneas B2B y sus señales de compra

### Línea 1 — Implementación empresarial ($3–15K + recurrente)
Bots WhatsApp, dashboards de ventas, integración contabilidad↔inventario, reportes automáticos.
Señales positivas (peso):
- Vacante de rol reemplazable: "asistente administrativo", "data entry", "digitador",
  "atención al cliente", "agendamiento", "cotizador" (peso alto, +25)
- Vende/atiende por WhatsApp; menciona "pedidos por WhatsApp" (+15)
- PYME 10–200 empleados, sector comercio/distribución/servicios (+10)
- Usa Excel/planillas para inventario o contabilidad; sin ERP moderno (+15)
- Crecimiento (contrata, abre sucursales) (+10)
Señales negativas: empresa muy pequeña (<5 empleados, sin presupuesto) o gigante con TI propio.

### Línea 2 — IA segura y local ($5–20K + mensual)
IA on-premise, datos no salen del cliente. Target regulado.
Señales positivas:
- Sector regulado: banca, seguros, salud/clínicas, legal, gobierno, contable (+30)
- Menciona confidencialidad, compliance, "datos sensibles", protección de datos (+20)
- Empresa mediana/grande con TI (puede pagar setup alto) (+10)
- Ya explora IA pero con reparo de privacidad (vacante "data/AI" + sector regulado) (+15)
Señales negativas: comercio minorista sin datos sensibles, micro-empresa.

### Línea 3 — Agencia web premium ($1.5–6K)
Sitios con animaciones 3D de nivel mundial.
Señales positivas:
- Web inexistente, obsoleta, o solo Instagram/Facebook como presencia (+25)
- Marca premium / alto ticket: inmobiliaria, restaurante fine-dining, hotel boutique,
  clínica estética, arquitectura, joyería, moda (+20)
- Invierte en marketing (pauta activa, agencia de contenido) (+10)
- Evento/lanzamiento próximo (+5)
Señales negativas: web reciente y buena ya; e-commerce que necesita plataforma, no vitrina.

### Línea 5 — Tours 3D inmobiliarios (Q4 2026, alto ticket)
Video de celular → recorrido 3D navegable.
Señales positivas:
- Inmobiliaria, desarrollador, corredor de bienes raíces, hotelería (+30)
- Publica muchas propiedades / listings (+15)
- Compite con Matterport o usa fotos pobres (+10)
Nota: peso reducido en el scoring hasta Q4 2026 (multiplicar por 0.5 mientras no esté activa).

## Modelo de puntaje (propuesta)

Enfoque híbrido en 2 capas — barato primero, caro solo si pasa el filtro:

**Capa A — reglas (determinista, costo casi 0):**
Se calcula un subpuntaje por línea sumando pesos de señales detectadas por keywords/reglas
sobre: título de vacante, descripción de vacante, sector (código o inferido), tamaño,
presencia web, ubicación. Normalizar cada subpuntaje a 0–100 con tope.
- `fit_score[linea] = min(100, Σ pesos_señales_presentes)`
- `best_line = argmax(fit_score)`, `best_score = max(fit_score)`
- Filtro: si `best_score < 40` → descartar lead (no contactar). Ahorra costo de LLM.

**Capa B — refinamiento con LLM (solo si best_score ≥ 40):**
Un solo llamado a Claude (Haiku) que recibe el contexto del lead + descripción de las 4 líneas
y devuelve, con salida estructurada (JSON schema / structured outputs):
- `linea_recomendada`, `confianza` (0–1), `justificacion` (1–2 frases),
  `angulo_de_venta` (el dolor concreto a mencionar en el correo), `dato_personalizador`
  (un hecho específico del lead para el correo).
Esto corrige falsos positivos de las reglas y ya prepara el input de la etapa 5 (redacción).

**Puntaje final:** `score_final = 0.6*best_score(reglas) + 0.4*(100*confianza_LLM)`.
Umbral de contacto sugerido: score_final ≥ 55 (ajustable con datos reales).

## Pesos — cómo calibrar
Arrancar con los pesos de arriba (juicio experto). Tras ~200 correos enviados, ajustar con
la tasa de respuesta real por rango de score (si el rango 55–70 responde igual que 70–100,
subir el umbral). No sobre-ingenierizar al inicio.

## Señales que hay que capturar en las etapas 1-3 para alimentar el scoring
- Sector / industria (de LinkedIn o del portal de empleo)
- Tamaño de empresa (rango de empleados)
- Cargo del contacto (para saber si es tomador de decisión)
- Presencia web (¿tiene sitio? ¿calidad?) — chequeo automatizable
- Texto de vacante si el lead vino de job posting (señal más fuerte de "puesto reemplazable")
- Ubicación (Panamá / LatAm)
