/**
 * verificarService — verificar los emails antes de que exista cualquier envío
 * (Fase 3).
 *
 * Capa: servicios. Traduce el vocabulario de MillionVerifier al nuestro y decide
 * QUÉ verificar. El "cómo hablarle a la API" está en `core/millionverifier.ts`.
 *
 * Para qué existe esta fase: proteger el dominio de envío. Mandar correo a
 * direcciones muertas sube la tasa de rebote, y una tasa de rebote alta hace que
 * Gmail y Outlook empiecen a mandar TODO nuestro correo a spam — incluido el que
 * sí llega a clientes reales. El estándar de la industria es rebote < 2%.
 */

import { verificarEmail, type Verificador } from '../core/millionverifier.ts';
import { poolPostgres, enTransaccion } from '../core/postgres.ts';
import type { EstadoVerificacion } from '../dominio/estados.ts';

/**
 * Traduce el veredicto del proveedor a nuestro estado.
 *
 * Función pura: se prueba sin API, sin base de datos y sin plata.
 *
 * Las dos decisiones que no son obvias:
 *
 *  - `disposable` → `invalido`. Son correos temporales (mailinator y similares).
 *    Para un NEGOCIO eso es o falso o desechable; no vale escribirle. Podría
 *    argumentarse que merece su propio estado, pero no cambiaría ninguna
 *    decisión nuestra: en ambos casos no se envía.
 *
 *  - `unknown` → `no_encontrado`. El servidor del destino no contestó de forma
 *    definitiva. NO es lo mismo que inválido — puede funcionar perfectamente.
 *    Por eso no lo llamamos `invalido`: mantiene abierta la posibilidad de
 *    re-verificarlo más adelante, mientras la puerta de envío actual lo excluye.
 */
export function traducir(result: string | undefined): EstadoVerificacion {
  switch (result) {
    case 'ok':
      return 'verificado';
    case 'catch_all':
      return 'catch_all';
    case 'invalid':
      return 'invalido';
    case 'disposable':
      return 'invalido';
    case 'unknown':
      return 'no_encontrado';
    default:
      // Un valor que el proveedor agregó y no conocemos. Conservador: no se
      // envía, pero se distingue de un `invalido` confirmado.
      return 'no_encontrado';
  }
}

export type ResultadoVerificacion = {
  emailsUnicos: number;
  llamadas: number;
  /** Filas de `contactos` actualizadas (mayor que `llamadas` si hay buzones compartidos). */
  filasActualizadas: number;
  porEstado: Record<string, number>;
  buzonesDeRol: number;
  /** Verificaciones que nos ahorramos por propagar a buzones compartidos. */
  llamadasAhorradas: number;
  costoUSD: number;
};

/** ~$0.0037 por verificación en el plan de entrada. Ver PROPUESTA-TECNICA §3. */
const COSTO_POR_VERIFICACION = 0.0037;

/**
 * Verifica los emails pendientes de una búsqueda.
 *
 * ===========================================================================
 * DECISIÓN CENTRAL: se verifica por EMAIL ÚNICO, no por fila de `contactos`.
 * ===========================================================================
 *
 * Ya sabemos (lo confirmó la prueba de la Fase 2) que las sucursales de una
 * cadena comparten buzón: `reservas@laterraza.com.pa` está en 2 negocios, o sea
 * 2 filas de `contactos`. Verificar fila por fila trae dos problemas:
 *
 *  1. **Cuesta plata de más.** Se paga dos veces la misma respuesta.
 *  2. **Puede dejar las filas inconsistentes.** La detección de `catch_all` no
 *     es totalmente determinista: dos llamadas al mismo email pueden dar
 *     resultados distintos. Terminaríamos con una sucursal `verificado` y la
 *     otra `catch_all`, y ninguna razón para preferir una.
 *
 * La propagación es GLOBAL, no limitada a esta búsqueda: si el mismo email
 * aparece en otra búsqueda, ya queda resuelto y nos ahorramos esa verificación
 * en el futuro.
 */
export async function verificarPendientes(
  busquedaId: string,
  opciones: {
    verificador?: Verificador;
    /** Tope de verificaciones, para no gastar de más en una corrida. */
    maximo?: number;
    /**
     * Re-verificar emails cuya verificación tenga más de N días.
     * Sin esto, solo se verifica lo que nunca se verificó.
     */
    reverificarDespuesDeDias?: number;
  } = {},
): Promise<ResultadoVerificacion> {
  const verificador = opciones.verificador ?? verificarEmail;
  const maximo = opciones.maximo ?? 500;

  // Emails DISTINTOS que hacen falta verificar en esta búsqueda.
  // `min(...)` sobre el estado es solo para tener una fila por email; lo que
  // importa es la lista de direcciones.
  const { rows: pendientes } = await poolPostgres().query<{ email: string; filas: string }>(
    `select lower(c.email) as email, count(*)::text as filas
     from contactos c
       join prospecciones p on p.negocio_id = c.negocio_id
     where p.busqueda_id = $1
       and c.email is not null
       and (
         c.estado_verificacion = 'pendiente'
         or ($2::int is not null and c.verificado_en < now() - make_interval(days => $2::int))
       )
     group by lower(c.email)
     order by count(*) desc
     limit $3`,
    [busquedaId, opciones.reverificarDespuesDeDias ?? null, maximo],
  );

  const r: ResultadoVerificacion = {
    emailsUnicos: pendientes.length,
    llamadas: 0,
    filasActualizadas: 0,
    porEstado: {},
    buzonesDeRol: 0,
    llamadasAhorradas: 0,
    costoUSD: 0,
  };

  for (const { email, filas } of pendientes) {
    const respuesta = await verificador(email);
    r.llamadas += 1;

    const estado = traducir(respuesta.result);
    const esRol = respuesta.role ?? null;

    r.porEstado[estado] = (r.porEstado[estado] ?? 0) + 1;
    if (esRol === true) r.buzonesDeRol += 1;
    // Cada fila extra con el mismo email es una verificación que no pagamos.
    r.llamadasAhorradas += Math.max(0, Number(filas) - 1);

    // Propagación global: todas las filas con este email, en cualquier negocio.
    const actualizadas = await enTransaccion(async (c) => {
      const { rowCount } = await c.query(
        `update contactos
         set estado_verificacion = $2,
             es_rol              = $3,
             verificado_en       = now()
         where lower(email) = $1`,
        [email, estado, esRol],
      );
      return rowCount ?? 0;
    });
    r.filasActualizadas += actualizadas;
  }

  r.costoUSD = r.llamadas * COSTO_POR_VERIFICACION;
  return r;
}

/**
 * Buzones compartidos por más de un negocio (el "dedup fino" de la Fase 3).
 *
 * No es solo una curiosidad: es lo que evita mandarle 15 correos casi idénticos
 * al mismo `info@` de una cadena. El operador tiene que ver esto ANTES de
 * aprobar.
 */
export async function buzonesCompartidos(
  busquedaId: string,
): Promise<Array<{ email: string; negocios: number; estado: string }>> {
  const { rows } = await poolPostgres().query<{
    email: string;
    negocios: string;
    estado: string;
  }>(
    `select lower(c.email) as email,
            count(distinct c.negocio_id)::text as negocios,
            min(c.estado_verificacion) as estado
     from contactos c
       join prospecciones p on p.negocio_id = c.negocio_id
     where p.busqueda_id = $1 and c.email is not null
     group by lower(c.email)
     having count(distinct c.negocio_id) > 1
     order by count(distinct c.negocio_id) desc`,
    [busquedaId],
  );
  return rows.map((x) => ({
    email: x.email,
    negocios: Number(x.negocios),
    estado: x.estado,
  }));
}
