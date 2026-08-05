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
 *   2. el email no fue confirmado como inválido (ver Pildoras.tsx: `pendiente` y
 *      `catch_all` SÍ entran acá — decide el empleado, no hay verificador pagado)
 *   3. el correo no está en la lista de opt-out
 *
 * Esta pantalla NO consulta las tablas directo a propósito. Si lo hiciera, podría
 * mostrar —y dejar aprobar— algo que no debe enviarse.
 *
 * ===========================================================================
 * Ya NO pide una búsqueda para funcionar (2026-08-04)
 * ===========================================================================
 *
 * Antes, sin `?busqueda=`, adivinaba "la más reciente con borradores" y
 * mostraba solo esa. Desde que "Generar borradores" en /leads puede crear
 * borradores de varias búsquedas de una vez, esa adivinanza dejaba la mitad
 * invisible. Ahora sin parámetro trae TODO lo pendiente, cruzando búsquedas
 * —igual que ya hace /leads—; `?busqueda=` sigue funcionando como filtro
 * opcional para acotar a una sola.
 */
export default async function Revision({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const busquedaId = sp['busqueda'];
  const cola = await colaDeRevision(busquedaId);

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
        controles: está pendiente, el correo no fue confirmado como inválido, y el
        destinatario no pidió que lo dejemos de contactar.
      </p>

      {elegido === undefined ? (
        <p className="tabla__vacia">
          No hay borradores por revisar.
          <br />
          Aparecen acá cuando alguien selecciona leads en{' '}
          <span className="mono">/leads</span> y aprieta «Generar borradores».
        </p>
      ) : (
        <>
          <p className="tenue" style={{ fontSize: 'var(--t-label)', margin: '0 0 var(--e3)' }}>
            {cola.length} por revisar · ordenados por score
            {busquedaId !== undefined && ' · filtrado a una búsqueda'}
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
