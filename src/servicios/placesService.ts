/**
 * placesService — descubrir negocios (Fase 1).
 *
 * Capa: servicios. Traduce el JSON de Places al dominio y decide cuánto pedir.
 * Es el ÚNICO lugar del proyecto que sabe cómo se llama un campo de Google; si
 * mañana cambiamos de proveedor de descubrimiento, se reescribe este archivo y
 * nada más.
 *
 * El lector de datos se INYECTA (`opciones.lector`). Por defecto llama a la API
 * real; en pruebas se le pasa un fixture. Así el pipeline se puede ejercitar sin
 * credenciales y sin gastar llamadas, y el cliente real no se contamina con
 * ramas de "modo prueba".
 */

import { buscarTexto, MAX_PAGINAS, type LugarCrudo, type RespuestaBusqueda } from '../core/places.ts';
import type { NegocioDescubierto, SearchSpec } from '../dominio/tipos.ts';

/** Firma del lector de páginas. La cumple `core/places.ts#buscarTexto`. */
export type Lector = (params: {
  consulta: string;
  pageToken?: string;
}) => Promise<{ datos: RespuestaBusqueda; crudo: unknown }>;

/**
 * Normaliza un nombre comercial para dedup.
 * "Bufete Morgan & Morgan, S.A." -> "bufete morgan morgan"
 */
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // quita los acentos que NFD dejo sueltos
    .toLowerCase()
    // sufijos societarios comunes en LatAm
    .replace(/\b(s\.?\s?a\.?\s?s?|s\.?\s?de\s?r\.?\s?l\.?|srl|ltda?|inc|corp|cia|y\s+cia)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ') // puntuacion fuera
    .replace(/\s+/g, ' ')
    .trim();
}

/** "https://www.bufete.com.pa/contacto?x=1" -> "bufete.com.pa" */
export function extraerDominio(url: string | undefined): string | null {
  if (url === undefined || url.trim() === '') return null;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function aDominio(lugar: LugarCrudo): NegocioDescubierto | null {
  const nombre = lugar.displayName?.text;
  // Sin nombre no hay negocio utilizable.
  if (nombre === undefined || nombre.trim() === '') return null;

  return {
    place_id: lugar.id ?? null,
    nombre: nombre.trim(),
    nombre_normalizado: normalizarNombre(nombre),
    dominio: extraerDominio(lugar.websiteUri),
    sitio_web: lugar.websiteUri ?? null,
    telefono: lugar.nationalPhoneNumber ?? null,
    direccion: lugar.formattedAddress ?? null,
    categoria_google: lugar.primaryType ?? null,
    rating: lugar.rating ?? null,
    num_resenas: lugar.userRatingCount ?? null,
    estado_negocio: lugar.businessStatus ?? null,
    url_maps: lugar.googleMapsUri ?? null,
  };
}

/**
 * ¿Vale la pena prospectar este negocio?
 *
 * Un local cerrado permanentemente no es un lead, es dato viejo. Se GUARDA
 * igual (es un hecho de la realidad, y borrar datos rompe la trazabilidad),
 * pero no se le abre una prospección. Esto NO contradice "priorizar, no
 * descartar": esa regla es sobre no filtrar por *encaje comercial*, no sobre
 * escribirle a negocios que ya no existen.
 */
export function esProspectable(n: NegocioDescubierto): boolean {
  return n.estado_negocio !== 'CLOSED_PERMANENTLY';
}

/**
 * Una consulta, con su paginación.
 *
 * OJO con el techo de Places: 20 por página y 3 páginas como máximo, o sea
 * ~60 negocios por consulta. Para más volumen, ver `buscarConTroceo`.
 */
export async function buscar(
  spec: SearchSpec,
  opciones: { limite?: number; lector?: Lector } = {},
): Promise<{
  negocios: NegocioDescubierto[];
  llamadas: number;
  huboMas: boolean;
}> {
  const limite = opciones.limite ?? 20;
  const lector = opciones.lector ?? ((p) => buscarTexto(p));
  const consulta = `${spec.categoria} en ${spec.ubicacion}`;

  const negocios: NegocioDescubierto[] = [];
  let pageToken: string | undefined;
  let llamadas = 0;

  while (negocios.length < limite && llamadas < MAX_PAGINAS) {
    const { datos } = await lector({ consulta, pageToken });
    llamadas += 1;

    for (const lugar of datos.places ?? []) {
      const n = aDominio(lugar);
      if (n !== null) negocios.push(n);
    }

    pageToken = datos.nextPageToken;
    if (pageToken === undefined) break;
  }

  return {
    negocios: negocios.slice(0, limite),
    llamadas,
    // Si Google todavía ofrecía token, hay más de lo que trajimos.
    huboMas: pageToken !== undefined,
  };
}

/**
 * Trocea la búsqueda para pasar el techo de ~60 resultados.
 *
 * Places no tiene forma de pedir "todos los restaurantes de Panamá": topa en 3
 * páginas por consulta. La salida es preguntar por zonas más chicas y unir los
 * resultados, deduplicando por `place_id` (las zonas vecinas se solapan y
 * devuelven el mismo negocio dos veces).
 *
 * Devuelve el conteo de llamadas por zona porque **eso es lo que se factura**:
 * antes de lanzar 40 zonas conviene ver el número.
 */
export async function buscarConTroceo(
  base: SearchSpec,
  zonas: string[],
  opciones: { porZona?: number; lector?: Lector } = {},
): Promise<{
  negocios: NegocioDescubierto[];
  llamadas: number;
  duplicadosDescartados: number;
  porZona: Record<string, number>;
}> {
  const vistos = new Map<string, NegocioDescubierto>();
  const sinPlaceId: NegocioDescubierto[] = [];
  const porZona: Record<string, number> = {};
  let llamadas = 0;
  let duplicadosDescartados = 0;

  for (const zona of zonas) {
    const { negocios, llamadas: n } = await buscar(
      { ...base, ubicacion: zona },
      { limite: opciones.porZona ?? 60, lector: opciones.lector },
    );
    llamadas += n;
    porZona[zona] = negocios.length;

    for (const negocio of negocios) {
      if (negocio.place_id === null) {
        // Sin clave natural no se puede deduplicar de forma confiable.
        sinPlaceId.push(negocio);
        continue;
      }
      if (vistos.has(negocio.place_id)) {
        duplicadosDescartados += 1;
        continue;
      }
      vistos.set(negocio.place_id, negocio);
    }
  }

  return {
    negocios: [...vistos.values(), ...sinPlaceId],
    llamadas,
    duplicadosDescartados,
    porZona,
  };
}

/**
 * Zonas de Ciudad de Panamá para trocear.
 *
 * Punto de partida por juicio, NO calibrado: hay que ajustarlo cuando se vea
 * cuántos resultados devuelve cada zona de verdad. Si una zona topa en 60,
 * está demasiado gruesa y hay que partirla.
 */
export const ZONAS_CIUDAD_PANAMA = [
  'Bella Vista, Ciudad de Panamá',
  'El Cangrejo, Ciudad de Panamá',
  'Obarrio, Ciudad de Panamá',
  'Costa del Este, Ciudad de Panamá',
  'Punta Pacífica, Ciudad de Panamá',
  'San Francisco, Ciudad de Panamá',
  'Casco Antiguo, Ciudad de Panamá',
  'Marbella, Ciudad de Panamá',
  'Paitilla, Ciudad de Panamá',
  'Coco del Mar, Ciudad de Panamá',
  'Betania, Ciudad de Panamá',
  'Parque Lefevre, Ciudad de Panamá',
  'El Dorado, Ciudad de Panamá',
  'Juan Díaz, Ciudad de Panamá',
  'Tocumen, Ciudad de Panamá',
  'Cerro Viento, La Chorrera',
] as const;
