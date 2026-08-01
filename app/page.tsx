import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { resumen, listarCorridas } from '../src/servicios/corridaService.ts';
import { conteoPorEstado } from '../src/servicios/panelService.ts';
import { EstadoCorridaPildora } from './componentes/Pildoras.tsx';
import { Embudo } from './componentes/Embudo.tsx';

/** Sin caché: el tablero tiene que reflejar lo que el cron acaba de hacer. */
export const dynamic = 'force-dynamic';

export default async function Tablero() {
  const [r, corridas, estados] = await Promise.all([
    resumen(),
    listarCorridas(5),
    conteoPorEstado(),
  ]);

  return (
    <>
      <h1>Tablero</h1>
      <p className="sub">
        Estado general de la prospección. El envío nunca es automático: los correos
        aprobados esperan a que se configure el dominio de envío.
      </p>

      {/*
        Métricas sin caja.
        --------------------------------------------------------------------
        Antes cada número vivía dentro de un rectángulo con borde y fondo. Seis
        cajas iguales le dan el mismo peso visual al marco que al contenido, y
        el número —que es lo único que importa— quedaba en 1.6rem compitiendo
        con su propio borde.

        Ahora el número es lo primero que se ve (36px, tabular) y la etiqueta va
        debajo en gris. Sin borde, sin fondo: la única línea es la que cierra la
        franja por abajo. Es exactamente el patrón de Vercel y de Linear.

        Lo que NO agregué: el «+12%» de tendencia. No hay datos históricos, así
        que sería un número inventado — justamente lo que este sistema evita.
      */}
      <div className="metricas">
        <Metrica valor={r.negocios} etiqueta="negocios" />
        <Metrica valor={r.conEmail} etiqueta="con correo" />
        <Metrica valor={r.verificados} etiqueta="verificados" />
        <Metrica
          valor={r.borradoresPendientes}
          etiqueta="por revisar"
          href="/revision"
          destacar={r.borradoresPendientes > 0}
        />
        <Metrica valor={r.aprobados} etiqueta="aprobados" />
        <Metrica valor={r.corridasActivas} etiqueta="corridas activas" />
      </div>

      <h2>Leads por etapa</h2>
      {Object.keys(estados).length === 0 ? (
        <p className="apagado">
          Todavía no hay leads. <Link href="/corridas/nueva">Empezá una búsqueda</Link>.
        </p>
      ) : (
        <Embudo conteos={estados} />
      )}

      <div className="entre" style={{ margin: 'var(--e7) 0 var(--e4)' }}>
        <h2 style={{ margin: 0 }}>Últimas corridas</h2>
        {corridas.length > 0 && (
          <Link href="/corridas" className="enlace-sutil">
            Ver todas <ArrowRight size={13} strokeWidth={2.25} />
          </Link>
        )}
      </div>

      {corridas.length === 0 ? (
        <p className="tabla__vacia">
          Ninguna corrida todavía.
          <br />
          <Link href="/corridas/nueva">Crear la primera</Link>
        </p>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Buscando</th>
                <th>Estado</th>
                <th>Paso</th>
              </tr>
            </thead>
            <tbody>
              {corridas.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/corridas/${c.id}`} className="tabla__principal">
                      {c.producto}
                    </Link>
                  </td>
                  <td className="tenue">
                    {c.categoria} · {c.ubicacion}
                  </td>
                  <td>
                    <EstadoCorridaPildora estado={c.estado} />
                  </td>
                  <td className="tenue mono">{c.paso}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/**
 * Una métrica.
 *
 * `href` es opcional a propósito: solo «por revisar» lleva a algún lado, porque
 * es la única que pide una acción. Hacer clicables las seis sería ruido — y
 * cuatro de ellas no tienen pantalla propia adonde ir.
 */
function Metrica({
  valor,
  etiqueta,
  href,
  destacar = false,
}: {
  valor: number;
  etiqueta: string;
  href?: string;
  destacar?: boolean;
}) {
  const cuerpo = (
    <>
      <div className="metrica__valor" style={destacar ? { color: 'var(--acento)' } : undefined}>
        {valor}
      </div>
      <div className="metrica__etiqueta">{etiqueta}</div>
    </>
  );

  return href === undefined ? (
    <div>{cuerpo}</div>
  ) : (
    <Link href={href} className="metrica--enlace">
      {cuerpo}
    </Link>
  );
}
