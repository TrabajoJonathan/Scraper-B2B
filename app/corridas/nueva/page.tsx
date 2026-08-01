import Link from 'next/link';
import { Info } from 'lucide-react';
import { FormularioBusqueda } from './FormularioBusqueda.tsx';

export default function NuevaCorrida() {
  return (
    <div className="angosto">
      <div className="miga">
        <Link href="/corridas">Corridas</Link>
      </div>

      <h1>Nueva búsqueda</h1>
      <p className="sub">
        Elegí qué producto querés vender y dónde buscar. El sistema busca a quien{' '}
        <strong>compra</strong> ese producto, no a quien lo produce.
      </p>

      <div className="aviso" style={{ marginBottom: 'var(--e6)' }}>
        <Info size={16} strokeWidth={2} />
        <div>
          Al enviar, la búsqueda queda <strong>encargada</strong>, no ejecutada. Vas a ver
          una pantalla de progreso: el trabajo se hace en segundo plano porque tarda
          minutos y no cabe en una sola petición.
        </div>
      </div>

      <FormularioBusqueda />

      {/*
        La ayuda de los campos pasó de tabla a lista de definiciones.
        --------------------------------------------------------------------
        Era una `<table>` sin encabezados con dos columnas: nombre del campo y
        explicación. Eso es exactamente un `<dl>` — y no es solo semántica, la
        tabla forzaba las dos columnas al mismo ancho, así que las explicaciones
        se leían en una tira angosta al lado de una palabra.
      */}
      <h2>De dónde sale cada campo</h2>
      <dl className="ayuda">
        <dt>Producto</dt>
        <dd>
          De la lista del jefe. Es lo que se va a ofrecer, y contra lo que se puntúa cada
          lead.
        </dd>

        <dt>Categoría</dt>
        <dd>
          El tipo de negocio a buscar en Google Maps. Tiene que ser quien <em>compra</em> el
          producto: para vender pan, «restaurantes», no «panaderías».
        </dd>

        <dt>Ubicación</dt>
        <dd>
          Google devuelve como máximo ~60 resultados por consulta, así que conviene buscar
          por zona (Bella Vista, Obarrio…) en vez de «Panamá» entero.
        </dd>
      </dl>
    </div>
  );
}
