import { FormularioBusqueda } from './FormularioBusqueda.tsx';

export default function NuevaCorrida() {
  return (
    <>
      <h1>Nueva búsqueda</h1>
      <p className="sub">
        Elegí qué producto querés vender y dónde buscar. El sistema busca a quien{' '}
        <strong>compra</strong> ese producto, no a quien lo produce.
      </p>

      <div className="aviso">
        Al enviar, la búsqueda queda <strong>encargada</strong>, no ejecutada. Vas a ver
        una pantalla de progreso: el trabajo se hace en segundo plano porque tarda
        minutos y no cabe en una sola petición.
      </div>

      <FormularioBusqueda />

      <h2>De dónde sale cada campo</h2>
      <table className="tabla">
        <tbody>
          <tr>
            <td><strong>Producto</strong></td>
            <td className="apagado">
              De la lista del jefe. Es lo que se va a ofrecer, y contra lo que se puntúa
              cada lead.
            </td>
          </tr>
          <tr>
            <td><strong>Categoría</strong></td>
            <td className="apagado">
              El tipo de negocio a buscar en Google Maps. Tiene que ser quien{' '}
              <em>compra</em> el producto: para vender pan, «restaurantes», no «panaderías».
            </td>
          </tr>
          <tr>
            <td><strong>Ubicación</strong></td>
            <td className="apagado">
              Google devuelve como máximo ~60 resultados por consulta, así que conviene
              buscar por zona (Bella Vista, Obarrio…) en vez de «Panamá» entero.
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
