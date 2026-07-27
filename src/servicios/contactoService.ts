/**
 * contactoService — extraer el contacto publico del sitio del negocio.
 *
 * ===========================================================================
 * PROVISIONAL — se reemplaza por Apify en la Fase 2.
 * ===========================================================================
 * Esta version hace un fetch simple del home (y de /contacto) y busca emails
 * con regex. Es "fea y desechable", como pide el Hito 0.5: sirve para ver la
 * rebanada completa funcionando sin esperar la cuenta de Apify.
 *
 * Cuando llegue Apify, se reescribe SOLO este archivo. Nada de arriba cambia
 * porque la firma (`extraerContacto(sitioWeb)`) se mantiene. Eso es justamente
 * lo que compra la regla de dependencia.
 *
 * Solo datos publicos: leemos la web que el propio negocio publica.
 */

const TIMEOUT_MS = 8000;
const MAX_BYTES = 600_000;

/** Rutas a intentar, en orden. Paramos en la primera que de email. */
const RUTAS = ['', '/contacto', '/contact', '/contactenos', '/nosotros'];

const RE_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Ruido tipico: assets, trackers, plantillas, direcciones de ejemplo. */
const RE_BASURA =
  /(@\d+x\.|\.(png|jpe?g|gif|svg|webp|css|js)$|sentry\.io|wixpress|example\.(com|org)|@sentry|@2x|no-?reply|donotreply|godaddy|squarespace|shopify)/i;

/** Buzones que en un negocio chico suelen ser el dueno. Mas arriba = mejor. */
const PREFIJOS_BUENOS = ['info', 'contacto', 'contact', 'ventas', 'hola', 'gerencia', 'admin'];

export type ContactoExtraido = {
  email: string | null;
  /** De donde salio: 'mailto' | 'contacto' | 'footer' | ... (Via B1) */
  origen: string | null;
  /** Todos los emails vistos, para inspeccion manual durante el hito. */
  candidatos: string[];
  /** Que URL respondio. null si ninguna. */
  urlUsada: string | null;
};

function puntuar(email: string, dominioNegocio: string | null): number {
  const [usuario, dominio] = email.toLowerCase().split('@');
  let puntos = 0;
  // Mismo dominio que el sitio: casi seguro es el buzon real de la empresa.
  if (dominioNegocio !== null && dominio !== undefined && dominio.endsWith(dominioNegocio)) {
    puntos += 100;
  }
  const idx = PREFIJOS_BUENOS.indexOf(usuario ?? '');
  if (idx !== -1) puntos += 50 - idx * 5;
  // Gmail/Hotmail de negocio chico sirve, pero es peor senal que dominio propio.
  if (dominio !== undefined && /gmail|hotmail|yahoo|outlook/.test(dominio)) puntos -= 20;
  return puntos;
}

async function traer(url: string): Promise<string | null> {
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
    const tipo = r.headers.get('content-type') ?? '';
    if (!tipo.includes('html')) return null;
    const texto = await r.text();
    return texto.slice(0, MAX_BYTES);
  } catch {
    // Timeout, DNS, TLS vencido, sitio caido. Todo normal en negocio local.
    return null;
  }
}

export async function extraerContacto(
  sitioWeb: string | null,
  dominioNegocio: string | null,
): Promise<ContactoExtraido> {
  const vacio: ContactoExtraido = {
    email: null,
    origen: null,
    candidatos: [],
    urlUsada: null,
  };
  if (sitioWeb === null || sitioWeb.trim() === '') return vacio;

  let base: URL;
  try {
    base = new URL(sitioWeb);
  } catch {
    return vacio;
  }

  const vistos = new Set<string>();

  for (const ruta of RUTAS) {
    const url = new URL(ruta === '' ? base.pathname : ruta, base).toString();
    const html = await traer(url);
    if (html === null) continue;

    const encontrados = (html.match(RE_EMAIL) ?? [])
      .map((e) => e.toLowerCase())
      .filter((e) => !RE_BASURA.test(e));

    for (const e of encontrados) vistos.add(e);

    if (vistos.size > 0) {
      const mejor = [...vistos].sort(
        (a, b) => puntuar(b, dominioNegocio) - puntuar(a, dominioNegocio),
      )[0];
      return {
        email: mejor ?? null,
        // mailto: en el HTML es senal mas fuerte que texto suelto.
        origen: html.includes(`mailto:${mejor}`) ? 'mailto' : ruta === '' ? 'footer' : 'contacto',
        candidatos: [...vistos],
        urlUsada: url,
      };
    }
  }

  return { ...vacio, candidatos: [...vistos] };
}
