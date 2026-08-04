# Revisión de las dos propuestas (cómo avanzar corridas sin cron + roadmap)

**Este documento es solo revisión. No se tocó código.** Cada afirmación de
abajo se verificó leyendo el archivo citado, no de memoria.

Dirección general: **de acuerdo con la Opción B** (que el detalle de la
corrida la haga avanzar mientras está abierta) y **de acuerdo con priorizar
estabilizar antes de agregar funciones**. Los puntos de abajo son
correcciones y matices sobre CÓMO, no un desacuerdo con el rumbo.

---

## 1. La propuesta del loop de 500ms tiene una ambigüedad que hay que resolver antes de construir

El diagrama dice:

```
La página carga → ejecutarPaso() → espera 500ms → ejecutarPaso() → ...
```

Esto describe el **efecto visual** que se quiere, pero no dice **dónde corre
el bucle**, y las dos opciones son muy distintas:

- **(a) Un bucle en el servidor, dentro de una sola petición.** El usuario abre
  la pantalla, el servidor llama `ejecutarPaso()` una y otra vez internamente
  hasta terminar (o hasta acercarse a un límite de tiempo), y devuelve el HTML
  final. Esto es, en la práctica, la **Opción A pero disparada al abrir la
  pantalla en vez de al crear la corrida** — mismo riesgo de tiempo, mismo
  perfil. Y para mostrar el progreso "en vivo" (las barras llenándose paso a
  paso, como en el mockup) necesitaría *streaming* de la respuesta, que es una
  pieza más de las que el diagrama no menciona.

- **(b) Un bucle en el navegador**, donde el cliente pide un paso, espera la
  respuesta, actualiza la pantalla, y pide el siguiente. Esto sí logra el
  efecto visual descrito, pero **no puede hacerse con el mecanismo que ya
  existe** (`<meta httpEquiv="refresh">`, ver más abajo): ese mecanismo recarga
  la página entera y no puede ir a 500ms sin parpadear. Hace falta un
  componente de cliente nuevo que llame con `fetch` y actualice el estado —
  chico, pero es código nuevo, no una reutilización de lo que hay.

**Mi recomendación:** la (b), porque es la que de verdad "aprovecha algo que
ya existe" en espíritu — pero hay que ser honestos en que el mecanismo
concreto (`<meta refresh>`) no sirve para eso y hay que reemplazarlo, no
ajustarle el número.

### El intervalo fijo de 500ms es riesgoso tal como está descrito

Verificado en `contactoService.ts`: cada sitio web tiene un timeout de **8
segundos**, y el paso de contacto baja hasta 12 sitios con 6 en paralelo. En
el peor caso (sitios lentos), **un solo `ejecutarPaso()` del paso "contacto"
puede tardar bastante más de 500ms** — ya lo vi en las pruebas con datos
reales.

Si el cliente dispara una llamada nueva cada 500ms **sin esperar a que la
anterior responda**, se pueden acumular varias llamadas en paralelo pisándose
(aunque `for update skip locked` evita que corrompan datos, sí desperdician
llamadas a Places/Claude en vano). La versión correcta es: esperar 500ms
**después de que vuelva la respuesta anterior**, no cada 500ms de reloj. Es
un detalle de implementación, pero cambia el comportamiento bajo carga real.

### Ir más rápido no cambia el costo, solo la espera visual

Vale aclarar esto porque no está dicho en ninguna de las dos propuestas: la
cantidad de llamadas a Places/Claude/MillionVerifier es la misma sin importar
si se hace polling cada 500ms o cada 5s — se procesa el mismo trabajo, nada
más. Lo único que cambia es cuánto tiempo mira la pantalla el empleado. Bueno
saberlo si en algún momento el argumento de "vamos más rápido" se confunde con
"gastamos menos".

---

## 2. El bug del refresco: el diagnóstico de la propuesta no es exacto

Cita textual de la propuesta: *"El refresh no debería ejecutarse en toda la
aplicación. Solo en `/corridas/[id]`."*

Revisé `app/corridas/[id]/page.tsx:43`. El código **ya** dice:

```tsx
{enCurso && <meta httpEquiv="refresh" content="5" />}
```

Es decir: ya está condicionado a esa pantalla específica y a que la corrida
esté en curso. En el código no existe ningún lugar donde ese `<meta>` se
renderice fuera de esa página. **El problema no es de alcance en el código.**

Lo que sí es real y coincide con el síntoma reportado ("navegaba en Leads y
me devolvía a la corrida"): `<meta http-equiv="refresh">` es un mecanismo del
navegador, no de React. Cuando Next.js navega del detalle de la corrida a
`/leads` usando un `<Link>` (navegación de cliente, sin recargar la página
completa), el temporizador que el navegador ya armó para esa etiqueta no
necesariamente se cancela solo porque React quitó el nodo de su árbol
virtual — es un mecanismo pensado para HTML estático de los 90, no para
aplicaciones de una sola página. Esto es coherente con lo que describiste,
aunque no lo reproduje en vivo para confirmarlo al 100%.

**La buena noticia:** el cambio que hace falta para la Opción B (reemplazar
el `<meta refresh>` por un componente de cliente con `useEffect` +
`setInterval`/`fetch`) **arregla esto solo, gratis, como efecto secundario**.
Un intervalo de React se cancela en la función de limpieza cuando el
componente se desmonta — que es exactamente lo que pasa al navegar a
`/leads`. No hace falta "arreglar el alcance"; hace falta cambiar el
mecanismo, y ese cambio ya vas a hacerlo por otra razón.

---

## 3. El riesgo de "corridas grandes" en la Opción A: ya existe un techo, y ya es más bajo que 200-500

La propuesta dice que el riesgo de Opción A es *"si una búsqueda tarda mucho
(200-500 negocios...)"*. Revisé `pipelineService.ts:200` y
`placesService.ts`: el paso `descubrir` llama a `buscar(spec, { limite: 60,
... })` — **hoy, cada corrida está topada en ~60 negocios**, por el límite de
paginación de la propia API de Google (20 por página, máximo 3 páginas).

Existe una función ya escrita (`buscarConTroceo`, en el mismo archivo) que
junta varias zonas para superar ese techo, pero **no está conectada al
pipeline** — nadie la llama desde `ejecutarPaso()`. Así que el escenario de
200-500 negocios no es un riesgo de hoy: sería un riesgo el día que alguien
decida conectar `buscarConTroceo`, que es una decisión aparte y no urgente.

Con el techo real de 60 y el descubrimiento medido en mis pruebas (segundos,
no minutos), la Opción A es menos arriesgada de lo que la propuesta asume —
pero elijo quedarme con la B igual, por la razón de costo/atención que ya
diste: no gastar cuando nadie mira.

---

## 4. Revisión del roadmap de fases

### Fase 1, punto 2 — "que el progreso avance correctamente"

Esto ya está resuelto, no es un pendiente. La corrida completada anteriormente
mostraba 71% en vez de 100% porque `terminarCorrida` no igualaba
`progreso_hecho` al total; se corrigió en la misma función. Verificado: las
corridas completadas hoy en la base muestran progreso 60/60, 6/6, 7/7 — no
hace falta re-tocarlo, solo confirmar que sigue así después del cambio de
Opción B.

### Fase 1, punto 3 — "corregir el bug del refresco"

Ver sección 2 arriba: el fix correcto es cambiar el *mecanismo* (a polling de
cliente), no acotar un alcance que ya está acotado.

### Fase 2 — selección múltiple de leads + "Generar borradores"

Esto **no es una tarea de interfaz menor**, aunque el mockup lo presente así.
Verifiqué `redaccionService.ts:238`: hoy, `generarBorradores()` ya filtra
solo prospecciones con `estado_verificacion = 'verificado'` — es decir, ya
existe un filtro automático de quién recibe borrador (el verificador de
email), y el paso `redactar` del pipeline lo aplica **sin intervención
humana**, como parte del avance normal de `ejecutarPaso()`.

Agregar selección manual de leads antes de redactar significa que el paso
`redactar` deja de ser "automático para todos los verificados" y pasa a ser
"solo para los que un humano eligió". Eso no es solo una casilla en la tabla:
es una decisión sobre **dónde vive el punto de control humano** en la máquina
de estados del pipeline (`src/dominio/estados.ts`) — si el pipeline automático
tiene que **detenerse** en `priorizado` y esperar a que alguien seleccione, o
si sigue redactando todo automáticamente y la selección solo filtra qué se
**muestra** en revisión (dos diseños muy distintos, con implicaciones de costo
distintas: uno gasta en Claude solo lo que un humano pidió, el otro sigue
gastando en todos los verificados igual que hoy).

No digo que la idea sea mala — es coherente con la filosofía de "un humano
decide" que ya tiene el resto del sistema. Digo que es una **decisión de
arquitectura para conversar antes de construir**, no un ítem de pulido de UI
al mismo nivel que "revisar iconos".

### Fase 4 — "limpieza" / "quitar comentarios de demo"

Vale un matiz importante: gran parte de los comentarios del código **no son
de demo**, son la explicación de decisiones de diseño (por qué `PISO_EJE =
10`, por qué se verifica por email único y no por contacto, por qué
`con_fixtures` existe). Esos comentarios son los que te permiten defender el
sistema ante el jefe sin depender de que yo esté ahí explicando. Sugiero que
"Fase 4" se refiera solo a **texto de interfaz** (placeholders como "sitio web
premium con animaciones 3D", textos temporales de prueba) y no a un barrido
general de comentarios del código.

### Fase 5 — integraciones

La lista dice *"Claude, MillionVerifier, Places (ya integrado), correo"*, como
si Claude siguiera pendiente. **Ya no es así**: tanto Places como Anthropic
están puestas y confirmadas funcionando desde el 2026-08-02/03 (ver
`docs/BITACORA-REDISENO-Y-DESPLIEGUE.md`). Lo único que falta hoy es
**MillionVerifier** y, más adelante, el envío de correo real.

---

## 5. Una sugerencia de orden, no una objeción al orden

El orden propuesto pone la selección múltiple de leads (Fase 2, la más
grande de las pendientes) antes de cerrar la única integración que falta
(MillionVerifier). Dos datos a favor de invertir ese orden:

- MillionVerifier es un cambio **chico y ya diseñado**: la interfaz
  (`Verificador`) y las pruebas de fixture ya existen; conectar la llave real
  es reemplazar una función, del mismo tamaño que fue conectar Places.
- Hoy mismo hay **13 correos reales** (de la corrida de Obarrio) que no
  generan borrador únicamente porque falta esa llave. Es la pieza más barata
  que falta y la que **desbloquea valor demostrable** de inmediato — mostrar
  un correo real, para un negocio real, escrito por Claude, es más contundente
  para el jefe que una interfaz de selección todavía sin llaves reales detrás.

Sugerencia: **conseguir la llave de MillionVerifier en paralelo** a estabilizar
las corridas (Fase 1), y decidir la Fase 2 (selección de leads) como una
conversación de arquitectura aparte, no como el tercer paso automático de la
lista.

---

## 6. Resumen de mi posición

| Punto | Propuesta | Mi ajuste |
|---|---|---|
| Cómo avanzar sin cron | Opción B (refresco avanza el pipeline) | De acuerdo. Implementar como polling de **cliente** (fetch), no como ajustar el `<meta refresh>` existente |
| Velocidad del polling | 500ms fijo | De acuerdo con ir más rápido que 5s, pero que espere la respuesta anterior antes de la siguiente, no un intervalo ciego |
| Bug del refresco en `/leads` | "Acotar el alcance" | El alcance ya está acotado en el código; el fix real es cambiar el mecanismo (viene gratis con el punto anterior) |
| Riesgo de corridas grandes | "200-500 negocios" como riesgo de Opción A | Ya hay un techo de 60 hoy; ese riesgo es de una función futura no conectada |
| Fase 2 (selección de leads) | Un ítem más del roadmap de UI | Es una decisión de arquitectura del pipeline — conversarla aparte |
| Fase 4 (limpieza) | "Quitar comentarios" | Solo texto de interfaz/demo; los comentarios de diseño se quedan |
| Fase 5 (integraciones) | Lista Claude como pendiente | Ya está resuelta; solo falta MillionVerifier |
| Orden general | Selección de leads antes de MillionVerifier | Sugiero invertir: MillionVerifier primero, es más chico y desbloquea valor ya mismo |

No se tocó ningún archivo de código. Decime qué de esto querés que construya
y en qué orden.
