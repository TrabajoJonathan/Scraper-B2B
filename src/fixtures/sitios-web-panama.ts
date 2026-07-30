/**
 * ============================================================================
 * HTML SINTÉTICO. NO son sitios web reales.
 * ============================================================================
 *
 * Cada sitio reproduce un patrón que sí se ve en negocio local panameño, para
 * probar el extractor de contactos sin salir a internet.
 *
 * **No dicen nada sobre la tasa real de éxito.** Eso solo lo sabremos corriendo
 * contra sitios de verdad. Estos fixtures prueban el código, no el mercado.
 *
 * Los casos, y por qué cada uno importa:
 *
 *  1. elfogonpanameno.com.pa — email en el footer, texto plano, mismo dominio.
 *     Trae basura a propósito (un DSN de Sentry, un asset @2x) que hay que filtrar.
 *  2. laterraza.com.pa       — el home NO tiene email; está en /contacto como
 *     mailto:. Prueba que el extractor recorre varias rutas.
 *  3. sushikobe.pa           — email OFUSCADO: "ventas (arroba) sushikobe.pa".
 *     Truco anti-spam muy común. Sin desofuscar, este lead se pierde.
 *  4. donnico.com.pa        — solo formulario de contacto, sin email visible.
 *     Camino `sin_contacto` por "el sitio respondió pero no hay email".
 *  5. marisqueriachela.com   — un gmail y un email corporativo. Debe preferir
 *     el corporativo.
 *  6. sitiocaido.com.pa      — no responde (simula timeout / TLS vencido / caído).
 */

import type { Traer } from '../servicios/contactoService.ts';

const SITIOS: Record<string, Record<string, string>> = {
  // ---------------------------------------------------------------- caso 1
  // Perfil de scoring: EL LEAD IDEAL 🎯
  // Invierte en publicidad (pixel de Meta + tag de Google) y tiene 412 reseñas
  // en Places -> CAPACIDAD alta. Pero su sitio no es responsive y el copyright
  // dice 2018 -> NECESIDAD alta. Puede pagar Y necesita: debe salir primero.
  'elfogonpanameno.com.pa': {
    '/': `<!doctype html><html lang="es"><head>
      <title>El Fogón Panameño</title>
      <script>Sentry.init({dsn:"https://abc123@o45678.ingest.sentry.io/1234"})</script>
      <link rel="preload" href="/img/logo@2x.png">
      <script>!function(f,b,e,v,n,t,s){fbq('init','123456789')}(window,document);</script>
      <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
      <script src="https://www.googletagmanager.com/gtag/js?id=AW-111"></script>
      </head><body>
      <h1>Restaurante El Fogón Panameño</h1>
      <p>Cocina panameña desde 1998.</p>
      <a href="https://instagram.com/elfogonpa">Instagram</a>
      <footer>
        <p>Calle 50, Bella Vista · Tel. 264-1234</p>
        <p>Escríbenos: info@elfogonpanameno.com.pa</p>
        <p>&copy; 2018 El Fogón Panameño</p>
      </footer></body></html>`,
  },

  // ---------------------------------------------------------------- caso 2
  // Perfil de scoring: PUEDE PAGAR PERO NO NECESITA
  // 2 sucursales, tag de Google, sitio responsive y copyright al día. Tiene
  // plata pero su web está bien -> no compra un sitio nuevo. Debe salir por
  // debajo del Fogón, y con `suma` en vez de media geométrica saldría arriba.
  'laterraza.com.pa': {
    // El home no tiene email: solo redes y teléfono.
    '/': `<!doctype html><html lang="es"><head><title>La Terraza</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <script src="https://www.googletagmanager.com/gtag/js?id=G-222"></script>
      </head><body>
      <h1>Cafetería La Terraza</h1>
      <nav><a href="/menu">Menú</a> <a href="/contacto">Contacto</a></nav>
      <p>Síguenos en <a href="https://instagram.com/laterrazapa">Instagram</a></p>
      <footer>Tel. 223-5566 · &copy; 2026 La Terraza</footer></body></html>`,
    '/contacto': `<!doctype html><html lang="es"><head><title>Contacto</title></head><body>
      <h2>Contáctanos</h2>
      <p>Reservas: <a href="mailto:reservas@laterraza.com.pa">reservas@laterraza.com.pa</a></p>
      <p>Administración: <a href="mailto:admin@laterraza.com.pa">admin@laterraza.com.pa</a></p>
      </body></html>`,
  },

  // ---------------------------------------------------------------- caso 3
  // Perfil de scoring: FLOJO EN LOS DOS EJES
  // Sin pixels, sin reseñas en Places (recién abierto), sitio responsive y al
  // día. No tiene plata demostrable ni necesita sitio nuevo.
  'sushikobe.pa': {
    '/': `<!doctype html><html lang="es"><head><title>Sushi Kobe</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      </head><body>
      <h1>Sushi Kobe</h1>
      <p>Pedidos y ventas: ventas (arroba) sushikobe.pa</p>
      <p>O al WhatsApp 6677-8899</p>
      <footer>&copy; 2026 Sushi Kobe</footer>
      </body></html>`,
    '/contacto': `<!doctype html><html><body>
      <p>Gerencia: gerencia [at] sushikobe.pa</p>
      </body></html>`,
  },

  // ---------------------------------------------------------------- caso 4
  // Ojo: este sitio es de "Parrillada Don Nico", que en Places está OPERATIONAL.
  // Antes era del negocio cerrado, y por eso este camino nunca se ejercitaba:
  // un negocio cerrado no llega a la Fase 2, así que el "sitio respondió pero
  // no hay email" quedaba sin probar.
  'donnico.com.pa': {
    '/': `<!doctype html><html lang="es"><head><title>Parrillada Don Nico</title></head><body>
      <h1>Parrillada Don Nico</h1>
      <p>Escríbenos por el formulario:</p>
      <form action="/enviar" method="post">
        <input name="nombre" placeholder="Su nombre">
        <input name="email" placeholder="Su correo">
        <textarea name="mensaje"></textarea>
        <button>Enviar</button>
      </form>
      <footer>© 2026 Parrillada Don Nico · Tel. 270-4455</footer></body></html>`,
  },

  // ---------------------------------------------------------------- caso 5
  'marisqueriachela.com': {
    '/': `<!doctype html><html lang="es"><head><title>Doña Chela</title></head><body>
      <h1>Marisquería Doña Chela</h1>
      <p>Pedidos por correo: donachela.mariscos@gmail.com</p>
      <footer>
        <p>Administración: administracion@marisqueriachela.com</p>
      </footer></body></html>`,
  },
};

/**
 * Devuelve un `Traer` que sirve el HTML de los fixtures.
 * `sitiocaido.com.pa` (y cualquier dominio no listado) devuelve null, igual que
 * un sitio caído o con TLS vencido.
 */
export function traerDeFixture(): Traer {
  return async (url: string) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const sitio = SITIOS[host];
    if (sitio === undefined) return null; // dominio caído o desconocido

    const ruta = u.pathname === '' ? '/' : u.pathname;
    return sitio[ruta] ?? null; // 404 en esa ruta
  };
}

export const DOMINIOS_EN_FIXTURE = Object.keys(SITIOS);
