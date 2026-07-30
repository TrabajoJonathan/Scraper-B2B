/**
 * ============================================================================
 * EL MOTOR — no conoce ninguna señal.
 * ============================================================================
 *
 * Ninguna señal concreta se nombra en este archivo. El motor recibe reglas y
 * pesos, y produce un score. Eso es lo que permite agregar, quitar o repesar
 * señales sin tocarlo. Hay una prueba que lo verifica leyendo el código fuente.
 *
 * Función pura: mismo lead + mismas reglas + mismos pesos = mismo score. Sin
 * base de datos, sin red, sin reloj. Auditable.
 */

import type {
  DetalleRegla,
  Eje,
  LeadParaScoring,
  Pesos,
  Regla,
  ResultadoScoring,
} from '../../dominio/scoring.ts';
import {
  ESTRATEGIA_POR_DEFECTO,
  PISO_EJE,
  type EstrategiaCombinacion,
} from './configuracion.ts';

/**
 * Normaliza un eje a 0..100.
 *
 * ===========================================================================
 * El detalle que importa: las reglas INDETERMINADAS salen del divisor.
 * ===========================================================================
 *
 * Si un eje tiene 5 reglas con peso total 88, pero de 2 no tenemos datos (peso
 * 23), el divisor es 65 y no 88. O sea: se puntúa sobre lo que efectivamente se
 * pudo evaluar.
 *
 * ¿Por qué? Porque si contáramos las indeterminadas como cero, un lead recién
 * descubierto —del que solo sabemos lo que dijo Places— siempre quedaría por
 * debajo de uno ya procesado, sin importar cuán bueno sea. El score mediría
 * "cuánto lo procesamos" en vez de "qué tan bueno es".
 *
 * Devuelve null si NINGUNA regla del eje se pudo evaluar: eso no es cero, es
 * "todavía no se sabe", y hay que poder distinguirlo.
 */
function normalizarEje(detalle: DetalleRegla[]): number | null {
  const evaluables = detalle.filter((d) => !d.indeterminado);
  const pesoTotal = evaluables.reduce((s, d) => s + d.peso, 0);
  if (pesoTotal === 0) return null;
  const obtenido = evaluables.reduce((s, d) => s + d.puntos, 0);
  return (obtenido / pesoTotal) * 100;
}

/**
 * Combina los dos ejes.
 *
 * `geometrica` — √(capacidad × necesidad).
 *
 *   Es la que está por defecto y vale explicar por qué. Si sumáramos, un negocio
 *   con mucha plata y un sitio impecable saldría alto — y ese no compra un sitio
 *   nuevo. La media geométrica castiga el desbalance:
 *
 *      √(100 × 0)  = 0     ← puede pagar pero no necesita: no es lead
 *      √(100 × 25) = 50
 *      √(60 × 60)  = 60    ← equilibrado: gana
 *      √(25 × 100) = 50    ← necesita pero no puede pagar
 *
 *   Selecciona el cuadrante "puede pagar Y necesita", que es exactamente lo que
 *   el jefe describió al juntar sus señales con la respuesta de la web fea.
 *
 * Si un eje es null (sin datos), se usa el otro solo: mejor un score parcial que
 * ninguno, y el detalle deja claro qué faltó.
 */
function combinar(
  capacidad: number | null,
  necesidad: number | null,
  estrategia: EstrategiaCombinacion,
): number | null {
  if (estrategia === 'solo_capacidad') return capacidad;
  if (capacidad === null && necesidad === null) return null;
  if (capacidad === null) return necesidad;
  if (necesidad === null) return capacidad;

  if (estrategia === 'suma') return (capacidad + necesidad) / 2;

  // El piso evita que un eje en 0 anule el score. Sin él, un 0 funciona como
  // descarte silencioso — y la regla del proyecto es priorizar, no descartar.
  // Ver el porqué completo en `configuracion.ts` → PISO_EJE.
  const c = Math.max(capacidad, PISO_EJE);
  const n = Math.max(necesidad, PISO_EJE);
  return Math.sqrt(c * n);
}

export type OpcionesMotor = {
  reglas: readonly Regla[];
  pesos: Pesos;
  estrategia?: EstrategiaCombinacion;
};

export function calcularScore(
  lead: LeadParaScoring,
  opciones: OpcionesMotor,
): ResultadoScoring {
  const estrategia = opciones.estrategia ?? ESTRATEGIA_POR_DEFECTO;
  const detalle: DetalleRegla[] = [];
  let filtradoPor: string | null = null;

  for (const regla of opciones.reglas) {
    const r = regla.evaluar(lead);
    // Una regla sin peso configurado vale 0: apagarla es poner 0, no borrarla.
    const peso = opciones.pesos[regla.id] ?? 0;

    if (regla.tipo === 'filtro') {
      // Un filtro no suma nunca; solo deja pasar o no. Y una regla de filtro
      // indeterminada NO filtra: no sabemos, así que no castigamos.
      if (!r.indeterminado && r.fuerza === 0) {
        filtradoPor ??= regla.id;
      }
      detalle.push({
        id: regla.id,
        eje: regla.eje,
        peso: 0,
        puntos: 0,
        razon: r.razon,
        indeterminado: r.indeterminado,
      });
      continue;
    }

    detalle.push({
      id: regla.id,
      eje: regla.eje,
      peso,
      puntos: r.fuerza * peso,
      razon: r.razon,
      indeterminado: r.indeterminado,
    });
  }

  const porEje: Record<Eje, number | null> = {
    capacidad: normalizarEje(detalle.filter((d) => d.eje === 'capacidad' && d.peso > 0)),
    necesidad: normalizarEje(detalle.filter((d) => d.eje === 'necesidad' && d.peso > 0)),
  };

  // Filtrado: no hay score. No es 0 — es "no aplica", y hay que distinguirlo de
  // un lead malo. El negocio igual queda en la base (priorizar, no descartar).
  if (filtradoPor !== null) {
    return {
      score: null,
      porEje,
      razon: 'sin canal de contacto',
      filtradoPor,
      detalle,
    };
  }

  const bruto = combinar(porEje.capacidad, porEje.necesidad, estrategia);
  const score = bruto === null ? null : Math.round(bruto);

  // La razón que ve el operador: solo las señales que aportaron, de mayor a
  // menor. Vía B1: el score sin explicación no se puede defender.
  const razon = detalle
    .filter((d) => d.razon !== null && d.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .map((d) => d.razon)
    .join(' · ');

  return {
    score,
    porEje,
    razon: razon === '' ? 'sin señales destacadas' : razon,
    filtradoPor: null,
    detalle,
  };
}
