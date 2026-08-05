/**
 * Reprocesa negocios `sin_contacto` que tienen sitio web, para recuperar
 * Instagram/Facebook/WhatsApp que el bug de negocioService.ts (arreglado el
 * 2026-08-04, migración 018) descartaba antes de esa fecha.
 *
 *   npm run reprocesar:redes          # corre sobre todo lo pendiente
 *   npm run reprocesar:redes -- 20     # tope de negocios, para probar rápido
 *
 * ===========================================================================
 * Por qué hace falta esto y no alcanza con que el pipeline ya esté arreglado
 * ===========================================================================
 *
 * El arreglo del 2026-08-04 solo cambia lo que pasa la PRÓXIMA vez que
 * `registrarContacto()` se llame para un negocio. Los negocios que ya se
 * procesaron ANTES de esa fecha quedaron con su fila congelada: su Instagram
 * se encontró, se descartó, y nadie los va a volver a visitar solos — ninguna
 * corrida futura vuelve a tocar un negocio que ya tiene una prospección en
 * `sin_contacto` (el pipeline no reprocesa, "no retrocede").
 *
 * ===========================================================================
 * Por qué es seguro correrlo cuantas veces haga falta
 * ===========================================================================
 *
 * No gasta ninguna API de pago: `extraerContacto()` es un `fetch` al sitio del
 * negocio, nada más. No cambia el estado de la prospección (ya está en
 * `sin_contacto`, y ahí se queda — este script solo completa lo que falta en
 * `contactos`). El filtro `c.id is null` hace que un negocio ya reprocesado
 * (por este script, o a mano) no se vuelva a tocar en la próxima corrida.
 */

import { poolPostgres, cerrarPostgres } from '../core/postgres.ts';
import { extraerContacto } from '../servicios/contactoService.ts';

/** Sitios en paralelo. Bajo a propósito: son sitios de terceros, no hay que agobiarlos. */
const CONCURRENCIA = 6;

async function enParalelo<T>(items: T[], limite: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (i < items.length) {
      const mio = items[i++];
      if (mio !== undefined) await fn(mio);
    }
  });
  await Promise.all(trabajadores);
}

const tope = process.argv[2] !== undefined ? Number(process.argv[2]) : undefined;

try {
  const { rows: candidatos } = await poolPostgres().query<{
    negocio_id: string; nombre: string; sitio_web: string; dominio: string | null;
  }>(
    `select n.id as negocio_id, n.nombre, n.sitio_web, n.dominio
       from prospecciones p
         join negocios n on n.id = p.negocio_id
         left join contactos c on c.negocio_id = n.id
      where p.estado = 'sin_contacto' and n.sitio_web is not null and c.id is null
      group by n.id, n.nombre, n.sitio_web, n.dominio
      order by n.nombre
      ${tope !== undefined ? `limit ${tope}` : ''}`,
  );

  console.log(`\n${candidatos.length} negocio(s) para reprocesar.\n`);

  let recuperados = 0;
  let sinNovedad = 0;
  let fallidos = 0;

  await enParalelo(candidatos, CONCURRENCIA, async (n) => {
    try {
      const c = await extraerContacto(n.sitio_web, n.dominio);
      if (c.redes === null) {
        sinNovedad += 1;
        console.log(`  ·  ${n.nombre} — nada nuevo (sitio sin Instagram/Facebook/WhatsApp linkeados)`);
        return;
      }
      // Se escribe directo a `contactos` en vez de llamar a registrarContacto():
      // esa función pide un prospeccionId para avanzar el estado de UNA
      // prospección puntual, y un negocio puede tener varias (una por
      // búsqueda, como Restaurante Gauchos). Acá no hace falta tocar ninguna
      // -- ya están correctamente en `sin_contacto` -- así que se hace el
      // mismo upsert que haría esa función, apuntando solo al negocio.
      //
      // email sigue null a propósito: si el sitio SÍ tuviera un email nuevo
      // hoy, corresponde que lo tome una corrida completa, no este script —
      // esto es solo para recuperar redes que ya se habían encontrado y se
      // habían perdido.
      await poolPostgres().query(
        `insert into contactos (negocio_id, email, redes)
         values ($1, null, $2)
         on conflict (negocio_id) where email is null do update set
           redes = coalesce(excluded.redes, contactos.redes)`,
        [n.negocio_id, JSON.stringify(c.redes)],
      );
      recuperados += 1;
      console.log(`  ✓  ${n.nombre} — recuperado: ${Object.keys(c.redes).join(', ')}`);
    } catch (error) {
      fallidos += 1;
      const mensaje = error instanceof Error ? error.message : String(error);
      console.log(`  ✗  ${n.nombre} — falló: ${mensaje.slice(0, 80)}`);
    }
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Recuperados: ${recuperados} · sin novedad: ${sinNovedad} · fallidos: ${fallidos}`);
  console.log('='.repeat(60));
} finally {
  await cerrarPostgres();
}
