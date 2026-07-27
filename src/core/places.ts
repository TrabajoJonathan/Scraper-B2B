/**
 * Cliente crudo de Google Places API (New).
 *
 * Capa: core. Habla HTTP y devuelve lo que Google manda, sin interpretar.
 * Quien normaliza es `servicios/placesService.ts`.
 *
 * Dos cosas que muerden y no son obvias:
 *
 * 1. El header `X-Goog-FieldMask` es OBLIGATORIO. Sin el, la API responde 400.
 *    Ademas el field mask determina el SKU que te cobran: pedir menos campos
 *    cuesta menos. Confirmar los cupos gratis por SKU en la consola de Google
 *    antes de prometer "capa gratis" (Google cambio el modelo en 2025).
 *
 * 2. Techo de resultados: 20 por pagina, maximo 3 paginas -> ~60 negocios por
 *    consulta. Para sacar volumen hay que trocear la busqueda por zona y
 *    subcategoria. Eso NO es un detalle de implementacion, es diseno de Fase 1.
 */

import { requerido } from './config.ts';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

/** Maximo que acepta la API por pagina. */
export const MAX_POR_PAGINA = 20;

/** Paginas maximas que devuelve la API (=> ~60 resultados por consulta). */
export const MAX_PAGINAS = 3;

/**
 * Campos que pedimos. Ordenado por para-que-sirve:
 *  - identidad y dedup: id, displayName, formattedAddress, websiteUri
 *  - contacto directo:  nationalPhoneNumber
 *  - scoring gratis:    rating, userRatingCount  (Fase 4)
 *  - categoria real:    types, primaryType, primaryTypeDisplayName
 *  - calidad del dato:  businessStatus (descarta cerrados permanentemente)
 */
export const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.types',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
  'places.googleMapsUri',
  'nextPageToken',
].join(',');

/**
 * Forma de un lugar tal como lo devuelve Places. Todo opcional a proposito:
 * la API omite los campos que no tiene (un negocio sin web no trae websiteUri).
 */
export type LugarCrudo = {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string; languageCode?: string };
  businessStatus?: string;
  googleMapsUri?: string;
};

export type RespuestaBusqueda = {
  places?: LugarCrudo[];
  nextPageToken?: string;
};

export type ParametrosBusqueda = {
  /** Consulta en lenguaje natural, ej: "firmas de abogados en Ciudad de Panama" */
  consulta: string;
  /** ISO 3166-1 alpha-2. "PA" = Panama. Sesga resultados y formato de direccion. */
  regionCode?: string;
  languageCode?: string;
  /** 1..20 */
  pageSize?: number;
  /** Token de la respuesta anterior para pedir la siguiente pagina. */
  pageToken?: string;
};

/**
 * Una llamada, una pagina. La paginacion la maneja el servicio de arriba
 * porque implica decidir cuanto gastar.
 *
 * Devuelve tambien `crudo`: el JSON intacto, para el spike. Ver los campos
 * reales antes de congelar el DDL es justamente el punto del Hito 0.5.
 */
export async function buscarTexto(
  params: ParametrosBusqueda,
): Promise<{ datos: RespuestaBusqueda; crudo: unknown }> {
  const apiKey = requerido('GOOGLE_PLACES_API_KEY');

  const cuerpo: Record<string, unknown> = {
    textQuery: params.consulta,
    languageCode: params.languageCode ?? 'es',
    regionCode: params.regionCode ?? 'PA',
    pageSize: Math.min(params.pageSize ?? MAX_POR_PAGINA, MAX_POR_PAGINA),
  };
  if (params.pageToken !== undefined) cuerpo['pageToken'] = params.pageToken;

  const respuesta = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(cuerpo),
  });

  const texto = await respuesta.text();

  if (!respuesta.ok) {
    // El cuerpo de error de Google dice exactamente que esta mal (field mask
    // invalido, API no habilitada, clave restringida). Lo propagamos entero.
    throw new Error(
      `Places API respondio ${respuesta.status} ${respuesta.statusText}\n${texto}`,
    );
  }

  const crudo: unknown = JSON.parse(texto);
  return { datos: crudo as RespuestaBusqueda, crudo };
}
