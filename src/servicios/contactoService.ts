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
  /**
   * Señales para el scoring (Fase 4), del mismo HTML. null si el sitio no
   * respondió: no sabemos, que es distinto de "no tiene pixel".
   */
  senalesWeb: SenalesWeb | null;
  /** El "sitio" es una red social o Linktree. Se decide por el dominio. */
  soloRedes: boolean;
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

/**
 * Señales del sitio para el scoring (Fase 4).
 *
 * ===========================================================================
 * Sale del MISMO HTML que ya descargamos para buscar el email.
 * ===========================================================================
 * Cero peticiones extra, cero costo, cero riesgo de ToS: es la página pública
 * del propio negocio.
 *
 * Reemplaza dos señales que el jefe pidió pero que no se pueden obtener sin
 * scrapear Instagram, Facebook o LinkedIn:
 *
 *   "inversión en ads (Meta Ad Library)" -> el pixel está en su propia página
 *   "actividad digital reciente (IG/FB)" -> año del copyright + tiene redes
 *
 * Y de paso salen las señales del eje NECESIDAD (sitio viejo, no responsive),
 * que era justo lo que le faltaba a su lista.
 */
export type SenalesWeb = {
  tiene_pixel_meta: boolean;
  tiene_tag_google: boolean;
  /** Año más alto que aparece junto a un © o "copyright". */
  anio_copyright: number | null;
  es_responsive: boolean;
  plataforma: string | null;
};

const RE_PIXEL_META = /fbq\s*\(|connect\.facebook\.net|fbevents\.js/i;
const RE_TAG_GOOGLE = /gtag\s*\(|googletagmanager\.com|google-analytics\.com|googleadservices/i;
const RE_VIEWPORT = /<meta[^>]+name\s*=\s*["']?viewport/i;
/** © 2019 · &copy; 2019-2024 · Copyright 2019 */
const RE_COPYRIGHT = /(?:©|&copy;|copyright)[^0-9]{0,20}((?:19|20)\d{2})/gi;

const PLATAFORMAS: Array<[string, RegExp]> = [
  ['wix', /wix\.com|wixstatic|_wixCssStates/i],
  ['wordpress', /wp-content|wp-includes|wordpress/i],
  ['shopify', /cdn\.shopify\.com|shopify\.js/i],
  ['squarespace', /squarespace\.com|static1\.squarespace/i],
  ['webflow', /webflow\.(com|js)|wf-/i],
  ['godaddy', /godaddysites\.com|starfieldtech/i],
];

export function extraerSenalesWeb(html: string, anioActual: number): SenalesWeb {
  // El copyright suele repetirse (footer, meta, scripts). Tomamos el AÑO MÁS
  // ALTO: si el footer dice 2019 pero un script dice 2025, el sitio se tocó
  // en 2025. Ser conservador acá evita marcar como abandonado un sitio vivo.
  let anio: number | null = null;
  for (const m of html.matchAll(RE_COPYRIGHT)) {
    const y = Number(m[1]);
    // Descarta años imposibles (fechas de librerías, números sueltos).
    if (y >= 2000 && y <= anioActual + 1 && (anio === null || y > anio)) anio = y;
  }

  const plataforma = PLATAFORMAS.find(([, re]) => re.test(html))?.[0] ?? null;

  return {
    tiene_pixel_meta: RE_PIXEL_META.test(html),
    tiene_tag_google: RE_TAG_GOOGLE.test(html),
    anio_copyright: anio,
    es_responsive: RE_VIEWPORT.test(html),
    plataforma,
  };
}

/**
 * ¿El "sitio web" es en realidad una red social o un Linktree?
 *
 * Se decide por el DOMINIO, no por el HTML: si su ficha de Places apunta a
 * instagram.com/elnegocio, no tienen sitio — tienen un perfil. Señal fuerte del
 * eje NECESIDAD.
 */
/**
 * Lista de dominios completos, no un patrón con sufijos.
 *
 * El primer intento fue un regex con grupo de sufijos, y `linktr.ee` nunca
 * coincidía: pedía "linktr.ee" y ADEMÁS un sufijo, o sea `linktr.ee.ee`. Lo
 * encontró la prueba. Una lista explícita es más aburrida y no se equivoca.
 */
const DOMINIOS_NO_SITIO = new Set([
  'instagram.com',
  'facebook.com',
  'fb.com',
  'm.me',
  'linktr.ee',
  'linktree.com',
  'beacons.ai',
  'bio.link',
  'wa.me',
  'api.whatsapp.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'sites.google.com',
]);

export function esSoloRedes(dominio: string | null): boolean {
  if (dominio === null) return false;
  return DOMINIOS_NO_SITIO.has(dominio.replace(/^www\./, '').toLowerCase());
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
  opciones: { traer?: Traer; anioActual?: number } = {},
): Promise<ContactoExtraido> {
  const traer = opciones.traer ?? traerConFetch;
  // El año se inyecta para que la extracción sea determinista y probable.
  const anioActual = opciones.anioActual ?? new Date().getFullYear();
  const vacio: ContactoExtraido = {
    email: null,
    origen: null,
    ofuscado: false,
    candidatos: [],
    redes: null,
    urlUsada: null,
    sitioRespondio: false,
    senalesWeb: null,
    soloRedes: esSoloRedes(dominioNegocio),
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
  let senalesWeb: SenalesWeb | null = null;

  for (const ruta of RUTAS) {
    const url = new URL(ruta, base).toString();
    const htmlCrudo = await traer(url);
    if (htmlCrudo === null) continue;

    sitioRespondio = true;
    // Las redes se acumulan de cualquier página que responda.
    redes = redes ?? extraerRedes(htmlCrudo);
    // Las señales se toman de la PRIMERA página que responda (el home casi
    // siempre): es donde viven los pixels y el footer con el copyright.
    senalesWeb = senalesWeb ?? extraerSenalesWeb(htmlCrudo, anioActual);

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
      senalesWeb,
      soloRedes: vacio.soloRedes,
    };
  }

  return { ...vacio, redes, sitioRespondio, senalesWeb };
}
