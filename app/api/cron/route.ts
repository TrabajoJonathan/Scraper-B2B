import { tick } from '../../../src/servicios/pipelineService.ts';
import { opcional } from '../../../src/core/config.ts';

/**
 * El cron. Vercel Cron le pega a esta ruta cada minuto.
 *
 * Cada invocación avanza UNA corrida UN paso. No corre el pipeline completo: no
 * cabría en el límite de tiempo de una función.
 *
 * ===========================================================================
 * SEGURIDAD: esta ruta NO puede ser pública
 * ===========================================================================
 *
 * Dispara trabajo que cuesta plata (llamadas a Places, Claude, verificador). Sin
 * protección, cualquiera con la URL podría vaciar el crédito llamándola en bucle.
 *
 * Vercel manda `Authorization: Bearer $CRON_SECRET` en sus invocaciones. Se exige
 * ese header salvo en desarrollo local, donde no hay riesgo y hace falta poder
 * llamarla a mano para la demo.
 */
export const dynamic = 'force-dynamic';
/** Pedimos el máximo: el paso de contacto baja varios sitios. */
export const maxDuration = 60;

export async function GET(peticion: Request): Promise<Response> {
  const secreto = opcional('CRON_SECRET');
  const enDesarrollo = process.env.NODE_ENV !== 'production';

  if (!enDesarrollo) {
    if (secreto === undefined) {
      // Falla cerrado: sin secreto configurado en producción, no corre. Es mejor
      // que una corrida no avance a que la ruta quede abierta.
      return Response.json(
        { error: 'CRON_SECRET no está configurado; la ruta queda cerrada' },
        { status: 500 },
      );
    }
    if (peticion.headers.get('authorization') !== `Bearer ${secreto}`) {
      return Response.json({ error: 'no autorizado' }, { status: 401 });
    }
  }

  const r = await tick();

  if (!r.hizoAlgo) {
    return Response.json({ ok: true, mensaje: 'nada pendiente' });
  }
  if (r.error !== undefined) {
    // 200 a propósito: el cron hizo su trabajo (tomó la corrida y registró el
    // fallo). Un 500 haría que Vercel lo marque como invocación fallida y
    // reintente, cuando el problema es de los datos, no del cron.
    return Response.json({ ok: false, error: r.error, usaFixtures: r.usaFixtures });
  }
  return Response.json({ ok: true, ...r.resultado, usaFixtures: r.usaFixtures });
}
