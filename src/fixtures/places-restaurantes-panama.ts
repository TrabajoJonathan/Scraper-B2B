/**
 * ============================================================================
 * DATOS SINTÉTICOS. NO son respuestas reales de Google Places.
 * ============================================================================
 *
 * Sirven para probar el pipeline sin gastar llamadas ni esperar credenciales.
 * **No usar para decidir nada del negocio** — la cobertura real de campos en
 * Panamá solo la dice el spike del Hito 0.5 contra la API de verdad.
 *
 * La estructura sí es la real de Places API (New): los nombres de campo, los
 * anidamientos (`displayName.text`) y las omisiones (la API no manda el campo
 * cuando no lo tiene) están calcados de la respuesta documentada.
 *
 * Cada negocio existe para ejercitar un caso borde concreto:
 *
 *  1. Fogón Panameño   — caso normal completo (rating alto, web, teléfono)
 *  2. La Terraza (V.E.) — sucursal 1 de una cadena
 *  3. La Terraza (C.d.E)— sucursal 2: MISMO dominio y MISMO nombre normalizado,
 *                         distinto place_id → prueba que el dedup NO las
 *                         colapsa, y que después comparten buzón
 *  4. Doña Chela        — SIN websiteUri → camino `sin_contacto`
 *  5. Sushi Kobe        — con web pero SIN rating ni reseñas → prueba el
 *                         respaldo del dato personalizador
 *  6. Napoli            — CLOSED_PERMANENTLY → no se le debe escribir
 *
 * Además viene paginado (5 + 1) para ejercitar el manejo de `nextPageToken`.
 */

import type { RespuestaBusqueda } from '../core/places.ts';

const PAGINA_1: RespuestaBusqueda = {
  places: [
    {
      id: 'FIXTURE_places/ChIJfogon001',
      displayName: { text: 'Restaurante El Fogón Panameño, S.A.', languageCode: 'es' },
      formattedAddress: 'Calle 50, Bella Vista, Ciudad de Panamá, Panamá',
      nationalPhoneNumber: '264-1234',
      websiteUri: 'https://www.elfogonpanameno.com.pa/',
      rating: 4.6,
      userRatingCount: 412,
      types: ['restaurant', 'food', 'point_of_interest'],
      primaryType: 'restaurant',
      primaryTypeDisplayName: { text: 'Restaurante', languageCode: 'es' },
      businessStatus: 'OPERATIONAL',
      googleMapsUri: 'https://maps.google.com/?cid=FIXTURE001',
    },
    {
      id: 'FIXTURE_places/ChIJterraza002',
      displayName: { text: 'Cafetería La Terraza (Vía España)', languageCode: 'es' },
      formattedAddress: 'Vía España 45, Ciudad de Panamá, Panamá',
      nationalPhoneNumber: '223-5566',
      websiteUri: 'https://laterraza.com.pa',
      rating: 4.2,
      userRatingCount: 187,
      types: ['cafe', 'restaurant', 'food'],
      primaryType: 'cafe',
      primaryTypeDisplayName: { text: 'Cafetería', languageCode: 'es' },
      businessStatus: 'OPERATIONAL',
      googleMapsUri: 'https://maps.google.com/?cid=FIXTURE002',
    },
    {
      // MISMA cadena que la anterior: mismo dominio, mismo nombre normalizado.
      // Distinta dirección y distinto place_id -> son negocios distintos.
      id: 'FIXTURE_places/ChIJterraza003',
      displayName: { text: 'Cafetería La Terraza (Costa del Este)', languageCode: 'es' },
      formattedAddress: 'Ave. Centenario, Costa del Este, Ciudad de Panamá, Panamá',
      nationalPhoneNumber: '306-7788',
      websiteUri: 'https://laterraza.com.pa',
      rating: 4.4,
      userRatingCount: 96,
      types: ['cafe', 'restaurant', 'food'],
      primaryType: 'cafe',
      primaryTypeDisplayName: { text: 'Cafetería', languageCode: 'es' },
      businessStatus: 'OPERATIONAL',
      googleMapsUri: 'https://maps.google.com/?cid=FIXTURE003',
    },
    {
      // Sin websiteUri: Places simplemente no manda el campo.
      id: 'FIXTURE_places/ChIJchela004',
      displayName: { text: 'Marisquería Doña Chela', languageCode: 'es' },
      formattedAddress: 'Mercado del Marisco, Ciudad de Panamá, Panamá',
      nationalPhoneNumber: '212-0099',
      rating: 4.8,
      userRatingCount: 1203,
      types: ['seafood_restaurant', 'restaurant', 'food'],
      primaryType: 'seafood_restaurant',
      primaryTypeDisplayName: { text: 'Marisquería', languageCode: 'es' },
      businessStatus: 'OPERATIONAL',
      googleMapsUri: 'https://maps.google.com/?cid=FIXTURE004',
    },
    {
      // Con web pero sin rating ni reseñas (negocio recién abierto).
      id: 'FIXTURE_places/ChIJkobe005',
      displayName: { text: 'Sushi Kobe Ltda', languageCode: 'es' },
      formattedAddress: 'Obarrio, Ciudad de Panamá, Panamá',
      websiteUri: 'http://sushikobe.pa/contacto',
      types: ['japanese_restaurant', 'restaurant', 'food'],
      primaryType: 'japanese_restaurant',
      primaryTypeDisplayName: { text: 'Restaurante japonés', languageCode: 'es' },
      businessStatus: 'OPERATIONAL',
      googleMapsUri: 'https://maps.google.com/?cid=FIXTURE005',
    },
  ],
  nextPageToken: 'FIXTURE_TOKEN_PAGINA_2',
};

const PAGINA_2: RespuestaBusqueda = {
  places: [
    {
      // Cerrado permanentemente: no se le debe escribir.
      id: 'FIXTURE_places/ChIJnapoli006',
      displayName: { text: 'Pizzería Nápoli', languageCode: 'es' },
      formattedAddress: 'El Cangrejo, Ciudad de Panamá, Panamá',
      websiteUri: 'https://pizzerianapoli.com.pa',
      rating: 3.9,
      userRatingCount: 54,
      types: ['pizza_restaurant', 'restaurant'],
      primaryType: 'pizza_restaurant',
      primaryTypeDisplayName: { text: 'Pizzería', languageCode: 'es' },
      businessStatus: 'CLOSED_PERMANENTLY',
      googleMapsUri: 'https://maps.google.com/?cid=FIXTURE006',
    },
  ],
  // Sin nextPageToken: aquí se acabó.
};

/**
 * Devuelve un lector con la misma firma que `core/places.ts#buscarTexto`, para
 * inyectarlo en `placesService.buscar()` sin tocar el cliente real.
 */
export function lectorDeFixture(): (params: {
  pageToken?: string;
}) => Promise<{ datos: RespuestaBusqueda; crudo: unknown }> {
  return async (params) => {
    const datos = params.pageToken === 'FIXTURE_TOKEN_PAGINA_2' ? PAGINA_2 : PAGINA_1;
    return { datos, crudo: datos };
  };
}

export const TOTAL_EN_FIXTURE = 6;
