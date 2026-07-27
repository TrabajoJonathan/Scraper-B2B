# Hito 5 — Redacción de correos personalizados con Claude

Fuente de pricing: skill `claude-api` (tabla de modelos, caché 2026-06-24). Verificado contra
el catálogo actual de modelos. La empresa YA usa Claude, así que esto encaja con su stack.

## Modelos candidatos y precio (USD por millón de tokens)

| Modelo | Input $/1M | Output $/1M | Uso recomendado |
|--------|-----------|-------------|-----------------|
| **Claude Haiku 4.5** (`claude-haiku-4-5`) | $1.00 | $5.00 | Redacción a escala — recomendado |
| **Claude Sonnet 5** (`claude-sonnet-5`) | $3.00 ($2 intro hasta 2026-08-31) | $15.00 ($10 intro) | Cuentas de alto valor / mejor prosa |
| Claude Opus 4.8 (`claude-opus-4-8`) | $5.00 | $25.00 | Sobredimensionado para esto |

## Costo por lead (estimación)

Supuestos de un correo de prospección personalizado:
- **Input:** system prompt (instrucciones de tono + ejemplos few-shot) ~1.500 tokens
  + contexto del lead (datos + señal + ángulo del scoring) ~500 tokens = **~2.000 tokens input**.
- **Output:** un correo de ~150–200 palabras ≈ **~350 tokens output**.

Costo por correo:
- **Haiku 4.5:** (2.000/1M × $1) + (350/1M × $5) = $0.0020 + $0.00175 = **~$0.0038 / correo** (~0,4 centavos)
- **Sonnet 5 (intro):** (2.000/1M × $2) + (350/1M × $10) = $0.004 + $0.0035 = **~$0.0075 / correo**
- **Sonnet 5 (precio normal):** ~$0.011 / correo

### Optimización con prompt caching
El system prompt (instrucciones + few-shot) es idéntico en todos los leads → cachearlo.
Lectura de caché cuesta ~0.1× del precio input. Con caché, el input efectivo por correo baja
a ~500 tokens a precio pleno + 1.500 a precio de caché:
- **Haiku 4.5 con caché:** ≈ **$0.0026 / correo**.
Para lotes grandes también sirve la **Batch API** (50% de descuento, no urgente).

### Escala mensual (referencia)
| Volumen/mes | Haiku sin caché | Haiku con caché | Sonnet 5 (normal) |
|-------------|-----------------|-----------------|-------------------|
| 500 correos | ~$1.9 | ~$1.3 | ~$5.5 |
| 1.000 | ~$3.8 | ~$2.6 | ~$11 |
| 2.000 | ~$7.6 | ~$5.2 | ~$22 |

**Conclusión: el costo de LLM es despreciable frente al de enriquecimiento y proxies.**
Incluso a 2.000/mes son pocos dólares. No es el cuello de botella de costo.

## Recomendación de modelo
- **Default: Haiku 4.5** para todo el volumen. Prosa más que suficiente para un primer correo
  corto y personalizado; costo mínimo.
- **Sonnet 5** solo para cuentas de alto ticket (Línea 2 IA local $5–20K, Línea 1 tope alto)
  donde vale afinar la prosa. Decidir por `score_final` o ticket estimado.

## Prompting (buenas prácticas)
- **Salida estructurada** (structured outputs) para que el correo venga en campos:
  `asunto`, `cuerpo`, `cta`. Facilita revisión y A/B.
- **System prompt estable** (cacheable): rol, tono CodeFlow (directo, en español de LatAm,
  sin jerga corporativa), reglas (una sola CTA, mencionar 1 dato personalizador real,
  <180 palabras, sin "espero que este correo le encuentre bien"), y 2-3 ejemplos few-shot
  de correos buenos por línea.
- **Input por lead:** nombre, cargo, empresa, línea recomendada + ángulo + dato personalizador
  (todo del scoring). Cuanto más concreto el dato personalizador, mayor tasa de respuesta.
- **Human-in-the-loop al inicio:** revisar los primeros ~50 correos antes de enviar; ajustar
  el prompt con lo aprendido. Luego semi-automatizar.
- **NO** prometer que el correo "pasará" filtros de spam por sí solo: la entregabilidad depende
  del dominio, calentamiento (warm-up), volumen y reputación — es un tema aparte del LLM.

## Nota de cumplimiento (correo en frío)
El costo/calidad del texto es fácil; el envío en frío tiene reglas: CAN-SPAM (US), GDPR/
ley local si hay contactos en EU/España, y buenas prácticas (opt-out claro, remitente real,
dominio dedicado y calentado). A tratar en la sección de riesgos del entregable.
