/**
 * contactoService — extraer el contacto público del sitio del negocio (Fase 2).
 *
 * ===========================================================================
 * PROVISIONAL — lo reemplaza Apify cuando llegue la cuenta.
 * ===========================================================================
 * Esta versión trae el HTML y busca emails. Cuando llegue Apify se reescribe
 * SOLO este archivo: la firma `extraerContacto(sitioWeb, dominio, opciones)` no
 * cambia, así que nada de arriba se toca. Eso es lo que compra la regla de
 * dependencia, y es la razón de que valga la pena escribir esta versión fea.
 *
 * El lector de páginas se INYECTA, igual que en placesService: en producción es
 * `fetch`, en pruebas son fixtures de HTML. Así la lógica de extracción se
 * valida sin salir a internet ni depender de que un sitio siga vivo.
 *
 * Solo datos públicos: leemos la web que el propio negocio publica.
 */

/**
 * Firma del lector de páginas. En producción la cumple `traerConFetch`; en
 * pruebas, un fixture. Se declara acá (no en `fixtures/`) porque el servicio no
 * puede depender de los fixtures — la flecha va al revés.
 */
export type Traer = (url: string) => Promise<string | null>;

const TIMEOUT_MS = 8000;
const MAX_BYTES = 600_000;

/**
 * Rutas a intentar, en orden. Se para en la primera que dé email: cada página
 * es una petición, y con Apify cada petición se factura.
 */
const RUTAS = ['/', '/contacto', '/contact', '/contactenos', '/nosotros', '/about'];

const RE_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Ruido típico: assets, trackers, plantillas, direcciones de ejemplo. */
const RE_BASURA =
  /(@\d+x\.|\.(png|jpe?g|gif|svg|webp|css|js)$|sentry\.io|ingest\.sentry|wixpress|example\.(com|org)|@2x|no-?reply|donotreply|godaddy|squarespace|shopify|sentry)/i;

/** Buzones que en un negocio chico suelen ser el dueño. Antes = mejor. */
const PREFIJOS_BUENOS = [
  'info', 'contacto', 'contact', 'ventas', 'reservas',
  'hola', 'gerencia', 'administracion', 'admin',
];

const PROVEEDORES_GENERICOS = /gmail|hotmail|yahoo|outlook|live\.com|icloud/;

export type ContactoExtraido = {
  email: string | null;
  /** Vía B1: DÓNDE estaba. 'mailto' | 'footer' | 'contacto' */
  origen: string | null;
  /**
   * CÓMO estaba escrito: true si venía ofuscado ("x (arroba) y.com").
   * Eje distinto de `origen`. Señal de que el negocio no quiere correo
   * automatizado — a considerar antes de aprobar envío.
   */
  ofuscado: boolean;
  /** Todos los emails vistos, para inspección manual. */
  candidatos: string[];
  redes: Record<string, string> | null;
  /** Qué URL respondió. null si ninguna. */
  urlUsada: string | null;
  /** true si el sitio respondió pero no había email (≠ sitio caído). */
  sitioRespondio: boolean;
};

/**
 * Deshace las ofuscaciones anti-spam más comunes en sitios en español.
 * "ventas (arroba) dominio.pa" -> "ventas@dominio.pa"
 *
 * Vale la pena: es barato y sin esto se pierde el lead completo, no solo un
 * dato. En sitios panameños aparece seguido.
 */
export function desofuscar(html: string): string {
  return html
    .replace(/\s*[([{]\s*(?:arroba|at)\s*[)\]}]\s*/gi, '@')
    .replace(/\s+arroba\s+/gi, '@')
    .replace(/\s*[([{]\s*(?:punto|dot)\s*[)\]}]\s*/gi, '.')
    .replace(/\s+punto\s+/gi, '.');
}

/** Más alto = mejor candidato. */
export function puntuarEmail(email: string, dominioNegocio: string | null): number {
  const partes = email.toLowerCase().split('@');
  const usuario = partes[0] ?? '';
  const dominio = partes[1] ?? '';
  let puntos = 0;

  // Mismo dominio que el sitio: casi seguro es el buzón real de la empresa.
  if (dominioNegocio !== null && dominio.endsWith(dominioNegocio)) puntos += 100;

  const idx = PREFIJOS_BUENOS.indexOf(usuario);
  if (idx !== -1) puntos += 50 - idx * 3;

  // Un gmail de negocio chico sirve, pero es peor señal que dominio propio.
  if (PROVEEDORES_GENERICOS.test(dominio)) puntos -= 40;

  return puntos;
}

function extraerRedes(html: string): Record<string, string> | null {
  const redes: Record<string, string> = {};
  const patrones: Array<[string, RegExp]> = [
    ['instagram', /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]+/i],
    ['facebook', /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9._-]+/i],
    ['whatsapp', /https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^\s"'<]+/i],
  ];
  for (const [nombre, re] of patrones) {
    const m = html.match(re);
    if (m !== null) redes[nombre] = m[0];
  }
  return Object.keys(redes).length > 0 ? redes : null;
}

/** El lector real: `fetch` con timeout y tope de tamaño. */
async function traerConFetch(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
      headers: {
        // Identificarse es lo correcto y reduce bloqueos.
        'User-Agent': 'CodeflowProspector/0.1 (+contacto comercial B2B)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!r.ok) return null;
    if (!(r.headers.get('content-type') ?? '').includes('html')) return null;
    return (await r.text()).slice(0, MAX_BYTES);
  } catch {
    // Timeout, DNS, TLS vencido, sitio caído. Todo normal en negocio local.
    return null;
  }
}

export async function extraerContacto(
  sitioWeb: string | null,
  dominioNegocio: string | null,
  opciones: { traer?: Traer } = {},
): Promise<ContactoExtraido> {
  const traer = opciones.traer ?? traerConFetch;
  const vacio: ContactoExtraido = {
    email: null,
    origen: null,
    ofuscado: false,
    candidatos: [],
    redes: null,
    urlUsada: null,
    sitioRespondio: false,
  };

  if (sitioWeb === null || sitioWeb.trim() === '') return vacio;

  let base: URL;
  try {
    base = new URL(sitioWeb);
  } catch {
    return vacio;
  }

  let sitioRespondio = false;
  let redes: Record<string, string> | null = null;

  for (const ruta of RUTAS) {
    const url = new URL(ruta, base).toString();
    const htmlCrudo = await traer(url);
    if (htmlCrudo === null) continue;

    sitioRespondio = true;
    // Las redes se acumulan de cualquier página que responda.
    redes = redes ?? extraerRedes(htmlCrudo);

    const html = desofuscar(htmlCrudo);
    const eraOfuscado = html !== htmlCrudo;

    const encontrados = [...new Set((html.match(RE_EMAIL) ?? []).map((e) => e.toLowerCase()))]
      .filter((e) => !RE_BASURA.test(e));

    if (encontrados.length === 0) continue;

    const ordenados = [...encontrados].sort(
      (a, b) => puntuarEmail(b, dominioNegocio) - puntuarEmail(a, dominioNegocio),
    );
    const mejor = ordenados[0]!;

    // DÓNDE estaba (eje independiente de si venía ofuscado).
    let origen: string;
    if (htmlCrudo.includes(`mailto:${mejor}`)) origen = 'mailto';
    else if (ruta === '/') origen = 'footer';
    else origen = 'contacto';

    // ¿Este email en particular solo apareció después de desofuscar?
    const ofuscado = eraOfuscado && !htmlCrudo.toLowerCase().includes(mejor);

    return {
      email: mejor,
      origen,
      ofuscado,
      candidatos: ordenados,
      redes,
      urlUsada: url,
      sitioRespondio,
    };
  }

  return { ...vacio, redes, sitioRespondio };
}
