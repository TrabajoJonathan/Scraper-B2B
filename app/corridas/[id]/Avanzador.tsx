'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hace avanzar la corrida mientras esta pantalla está montada. Reemplaza al
 * viejo `<meta httpEquiv="refresh">`.
 *
 * ===========================================================================
 * Por qué no alcanzaba con ponerle un intervalo más corto al meta-refresh
 * ===========================================================================
 *
 * Dos razones, no una:
 *
 *   1. `<meta refresh>` solo RECARGA — no puede, de paso, decirle al servidor
 *      "dale un paso más a esta corrida". Alguien tenía que llamar al pipeline,
 *      y antes ese alguien era el cron. Sin cron, la recarga sola no avanzaba
 *      nada: por eso la corrida `76e224f5` (creada el 2026-08-04 desde la
 *      interfaz) se quedó pegada en "pendiente" para siempre.
 *
 *   2. Es un mecanismo del NAVEGADOR, ajeno al router de Next. Al navegar de
 *      esta pantalla a otra con un `<Link>` (navegación de cliente, sin
 *      recargar), el temporizador que el navegador ya había armado para esta
 *      etiqueta no se cancela solo — no está pensado para una app de una sola
 *      página. Coincide con lo que reportaste: entrabas a Leads y a los pocos
 *      segundos volvía a la corrida.
 *
 * Un `useEffect` de React sí se cancela al desmontar (la función que devuelve
 * corre justo ahí), así que al salir de esta pantalla el sondeo se corta solo.
 * Es la razón de fondo por la que esto arregla el bug de navegación: no porque
 * se le haya puesto un "alcance" nuevo (el meta-refresh YA vivía solo en esta
 * pantalla), sino porque el mecanismo en sí ahora respeta el ciclo de vida de
 * React en vez de ser un temporizador suelto del navegador.
 *
 * ===========================================================================
 * Por qué espera a la respuesta antes de pedir el siguiente paso
 * ===========================================================================
 *
 * El paso de contacto puede tardar varios segundos (baja varios sitios reales,
 * hasta 8s de timeout cada uno). Si se pidiera "cada 400ms" a reloj sin
 * esperar, se acumularían llamadas superpuestas. Acá se espera la respuesta
 * completa y RECIÉN AHÍ se programa la siguiente — así nunca hay dos pedidos
 * de esta pestaña en el aire a la vez, sin importar cuánto tarde un paso.
 *
 * La espera fija entre vueltas (600ms) es solo para que la barra de progreso
 * se vea avanzar en vez de saltar de golpe — no cambia cuánto se gasta en
 * Places/Claude: la cantidad de llamadas es la misma sin importar qué tan
 * rápido se sondee, solo cambia cuánto tarda en VERSE terminado.
 */
export function Avanzador({ corridaId }: { corridaId: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelado = false;

    async function sondear() {
      while (!cancelado) {
        let datos: { ok: boolean; hizoAlgo: boolean; resultado?: { termino: boolean } };
        try {
          const r = await fetch(`/api/corridas/${corridaId}/avanzar`, { method: 'POST' });
          datos = await r.json();
        } catch {
          // Sin red o sesión vencida: se deja de intentar. Recargar la página
          // a mano vuelve a autenticar y retoma desde donde quedó.
          break;
        }
        if (cancelado) break;

        // Nada que hacer (ya terminó, falló, u otra pestaña se la llevó): no
        // hay nada nuevo que mostrar, no vale la pena refrescar.
        if (!datos.hizoAlgo) break;

        router.refresh();

        if (!datos.ok || datos.resultado?.termino === true) break;

        await new Promise((resolver) => setTimeout(resolver, 600));
      }
    }

    void sondear();
    return () => {
      cancelado = true;
    };
  }, [corridaId, router]);

  return null;
}
