import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Clock, FlaskConical, TriangleAlert } from 'lucide-react';
import { obtenerCorrida, PASOS } from '../../../src/servicios/corridaService.ts';
import { conteoPorEstado } from '../../../src/servicios/panelService.ts';
import { EstadoCorridaPildora } from '../../componentes/Pildoras.tsx';
import { Pasos } from '../../componentes/Pasos.tsx';
import { Embudo } from '../../componentes/Embudo.tsx';

export const dynamic = 'force-dynamic';

/** «a, b y c» — para que el aviso se lea como una frase y no como una lista. */
function listar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

export default async function DetalleCorrida({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const corrida = await obtenerCorrida(id);
  if (corrida === null) notFound();

  const estados = await conteoPorEstado(corrida.busqueda_id);
  const enCurso = corrida.estado === 'pendiente' || corrida.estado === 'corriendo';

  const indiceActual = PASOS.indexOf(corrida.paso);
  const porcentaje =
    corrida.progreso_total !== null && corrida.progreso_total > 0
      ? Math.round((corrida.progreso_hecho / corrida.progreso_total) * 100)
      : Math.round((indiceActual / (PASOS.length - 1)) * 100);

  return (
    <>
      {/*
        Recarga automática mientras el trabajo está en curso. Es la solución más
        simple que funciona: sin websockets, sin estado en el cliente. Cuando la
        corrida termina, el meta desaparece y la página deja de recargarse.
      */}
      {enCurso && <meta httpEquiv="refresh" content="5" />}

      <div className="miga">
        <Link href="/corridas">Corridas</Link>
      </div>

      <h1>{corrida.producto}</h1>
      <p className="sub">
        Buscando <strong>{corrida.categoria}</strong> en <strong>{corrida.ubicacion}</strong>
        {corrida.creada_por_email !== null && <> · pedida por {corrida.creada_por_email}</>}
      </p>

      {/*
        Mismo criterio que con el suplente de autenticación: si el sistema opera
        con datos falsos, tiene que decirlo. Un lead inventado se ve idéntico a
        uno real, y dentro de un mes nadie se va a acordar de cuál era cuál.
      */}
      {/*
        El aviso ahora dice QUÉ es inventado, no solo que algo lo es.
        Con llaves para unas integraciones y no para otras, la corrida puede
        traer negocios reales de Google Maps con correos de contacto inventados
        — y eso es más peligroso que tener todo falso: el negocio real le presta
        credibilidad al email que no existe.
      */}
      {corrida.con_fixtures && (
        <div className="aviso aviso--alerta" style={{ marginBottom: 'var(--e5)' }}>
          <FlaskConical size={16} strokeWidth={2} />
          <div>
            <strong>Datos parcialmente sintéticos.</strong>{' '}
            {corrida.fixtures_en.length > 0 ? (
              <>
                En esta corrida <strong>{listar(corrida.fixtures_en)}</strong>{' '}
                {corrida.fixtures_en.length === 1 ? 'es inventado' : 'son inventados'}, porque
                faltan esas credenciales. El resto es real.
              </>
            ) : (
              <>Esta corrida usó datos inventados por falta de credenciales.</>
            )}{' '}
            No aprobar nada de acá como si fuera un contacto verificado.
          </div>
        </div>
      )}

      {corrida.error !== null && (
        <div className="aviso aviso--riesgo" style={{ marginBottom: 'var(--e5)' }}>
          <TriangleAlert size={16} strokeWidth={2} />
          <div>
            <strong>Falló.</strong> <span className="mono">{corrida.error}</span>
          </div>
        </div>
      )}

      {/*
        Bloque de progreso.
        --------------------------------------------------------------------
        Antes la barra, los pasos y el contador estaban sueltos uno debajo del
        otro, sin nada que dijera que son la misma cosa. Ahora van juntos en un
        panel: es EL estado del trabajo, leído de arriba abajo — cuánto va, en
        qué paso está, cuántos procesó.
      */}
      <section className="panel">
        <div className="panel__cabeza">
          <div className="grupo">
            <EstadoCorridaPildora estado={corrida.estado} />
            <span className="tenue" style={{ fontSize: 'var(--t-desc)' }}>
              {corrida.progreso_total === null
                ? `${corrida.progreso_hecho} procesados`
                : `${corrida.progreso_hecho} de ${corrida.progreso_total}`}
            </span>
          </div>
          <span className="mono tenue" style={{ fontSize: 'var(--t-desc)' }}>
            {porcentaje}%
          </span>
        </div>

        <div className="panel__cuerpo">
          <div className="progreso" style={{ marginBottom: 'var(--e5)' }}>
            <div
              className="progreso__barra"
              style={{
                width: `${porcentaje}%`,
                background: corrida.estado === 'fallida' ? 'var(--riesgo)' : undefined,
              }}
            />
          </div>

          <Pasos pasoActual={corrida.paso} estado={corrida.estado} />
        </div>

        {enCurso && (
          <div className="panel__pie">
            <Clock size={14} strokeWidth={2} />
            <span>
              El trabajo lo hace el cron en segundo plano, <strong>un paso por vez</strong>. Esta
              página se actualiza sola cada 5 segundos. En local el cron se levanta con{' '}
              <span className="mono">npm run cron</span>; en Vercel corre solo cada minuto.
            </span>
          </div>
        )}
      </section>

      <h2>Leads de esta corrida</h2>
      {Object.keys(estados).length === 0 ? (
        <p className="apagado">Todavía no hay leads: el trabajo no arrancó.</p>
      ) : (
        <>
          <Embudo conteos={estados} />
          <p style={{ marginTop: 'var(--e5)' }}>
            <Link href={`/leads?busqueda=${corrida.busqueda_id}`} className="enlace-sutil">
              Ver los leads de esta corrida <ArrowRight size={13} strokeWidth={2.25} />
            </Link>
          </p>
        </>
      )}
    </>
  );
}
