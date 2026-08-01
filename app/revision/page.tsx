import { poolPostgres } from '../../src/core/postgres.ts';
import { colaDeRevision } from '../../src/servicios/revisionService.ts';
import { ListaBorradores } from './ListaBorradores.tsx';
import { PanelBorrador } from './PanelBorrador.tsx';

export const dynamic = 'force-dynamic';

/**
 * La cola de revisión: la pantalla donde vive el control humano.
 *
 * Lee de `colaDeRevision()`, que a su vez lee de `v_correos_enviables`. O sea que
 * lo que se muestra ya pasó las tres puertas:
 *   1. está pendiente de revisión
 *   2. el correo está verificado (los catch-all se saltan, decisión del jefe)
 *   3. el correo no está en la lista de opt-out
 *
 * Esta pantalla NO consulta las tablas directo a propósito. Si lo hiciera, podría
 * mostrar —y dejar aprobar— algo que no debe enviarse.
 */
export default async function Revision({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  let busquedaId = sp['busqueda'];

  // Sin búsqueda elegida: se toma la más reciente que tenga borradores por revisar.
  if (busquedaId === undefined) {
    const { rows } = await poolPostgres().query<{ id: string }>(
      `select b.id from busquedas b
         join prospecciones p on p.busqueda_id = b.id
         join correos co on co.prospeccion_id = p.id
       where co.estado in ('borrador','editado')
       group by b.id order by max(co.creado_en) desc limit 1`,
    );
    busquedaId = rows[0]?.id;
  }

  const cola = busquedaId === undefined ? [] : await colaDeRevision(busquedaId);

  /*
   * Cuál borrador se muestra a la derecha.
   *
   * El `?? cola[0]` no es un detalle: después de aprobar, la acción hace
   * `revalidatePath('/revision')` pero la URL se queda con el `?correo=` del que
   * acabás de aprobar — y ese ya salió de la cola. Al no encontrarlo, cae al
   * primero, así que aprobar avanza solo al siguiente. Es el mismo
   * comportamiento de una bandeja de entrada, y sale de una línea.
   */
  const pedido = sp['correo'];
  const elegido = cola.find((c) => c.correoId === pedido) ?? cola[0];

  return (
    <>
      <h1>Revisión</h1>
      <p className="sub">
        Nada sale sin que alguien lo apruebe acá. Lo que se muestra ya pasó tres
        controles: está pendiente, el correo está verificado, y el destinatario no pidió
        que lo dejemos de contactar.
      </p>

      {elegido === undefined ? (
        <p className="tabla__vacia">
          No hay borradores por revisar.
          <br />
          Aparecen acá cuando una corrida llega al paso de redacción.
        </p>
      ) : (
        <>
          <p className="tenue" style={{ fontSize: 'var(--t-label)', margin: '0 0 var(--e3)' }}>
            {cola.length} por revisar · ordenados por score
          </p>

          <div className="revision">
            <ListaBorradores
              items={cola}
              seleccionado={elegido.correoId}
              busquedaId={busquedaId}
            />
            {/* `key` remonta el panel al cambiar de borrador: ver el comentario allá. */}
            <PanelBorrador key={elegido.correoId} borrador={elegido} />
          </div>
        </>
      )}
    </>
  );
}
