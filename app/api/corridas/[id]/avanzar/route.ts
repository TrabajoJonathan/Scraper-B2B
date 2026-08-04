import { avanzarCorridaEspecifica } from '../../../../../src/servicios/pipelineService.ts';

/**
 * Le da UN paso a la corrida `id`. La llama `Avanzador.tsx`, un componente de
 * cliente montado en `/corridas/[id]` mientras la corrida está en curso —
 * reemplaza al cron: la corrida avanza mientras alguien tiene esa pantalla
 * abierta, y queda en pausa si la cierra.
 *
 * ===========================================================================
 * Seguridad: la protege `middleware.ts`, no un secreto en esta ruta
 * ===========================================================================
 *
 * A diferencia de `/api/cron` (pensada para que la llame Vercel Cron, sin
 * sesión de empleado, protegida con `CRON_SECRET`), esta ruta la llama el
 * navegador de un empleado ya logueado. El matcher de `middleware.ts` cubre
 * todo `/api/*` menos lo que está en `PUBLICAS`, y esta ruta no está ahí — así
 * que sin sesión, ni se llega a este código.
 *
 * No hace falta un `usuarioParaAuditoria()` acá: avanzar un paso no es una
 * decisión que haya que auditar (a diferencia de aprobar/editar/descartar un
 * correo), es trabajo de máquina. Quién aprueba sí se registra; quién apretó
 * "avanzar" no importa.
 */
export const dynamic = 'force-dynamic';
/** Un paso, no la corrida entera — mismo límite que tenía `/api/cron`. */
export const maxDuration = 60;

export async function POST(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const r = await avanzarCorridaEspecifica(id);

  if (!r.hizoAlgo) {
    // No es un error: la corrida ya está completa, falló, o la tomó otra
    // pestaña. El cliente lo lee como "no hay más que hacer" y deja de sondear.
    return Response.json({ ok: true, hizoAlgo: false });
  }
  if (r.error !== undefined) {
    return Response.json({ ok: false, hizoAlgo: true, error: r.error });
  }
  return Response.json({ ok: true, hizoAlgo: true, resultado: r.resultado });
}
