/**
 * Tipos del dominio. Capa: dominio (cero dependencias).
 *
 * Espejo del esquema en supabase/migraciones/. Si cambia una tabla, cambia aca.
 */

import type { EstadoProspeccion, EstadoVerificacion } from './estados.ts';

/** Canal de descubrimiento. El canal depende del PRODUCTO, no del modo. */
export const CANALES = ['google_maps', 'vacantes'] as const;
export type Canal = (typeof CANALES)[number];

/**
 * La costura Modo 1 / Modo 2. El pipeline consume esto y es CIEGO a quien lo
 * genero: en Modo 1 la categoria viene de la lista del jefe, en Modo 2 la
 * razona el cerebro (Claude). Nunca hardcodear "la entrada es la lista".
 */
export type SearchSpec = {
  producto: string;
  categoria: string;
  ubicacion: string;
  canal: Canal;
};

/** El "por que" de cada corrida. Permite repetir sin confundir resultados. */
export type Busqueda = SearchSpec & {
  id: string;
  /** Quien lleno el searchSpec: 'lista_jefe' (Modo 1) | 'cerebro' (Modo 2) */
  fuente: 'lista_jefe' | 'cerebro';
  creada_en: string;
};

/**
 * La EMPRESA. Una fila por empresa del mundo real, sin importar cuantas
 * busquedas la encontraron.
 *
 * FIX DE ARQUITECTURA (a): esta tabla ya NO tiene `busqueda_id`.
 * Un solo FK a busquedas hacia imposible el dedup que el propio roadmap pide
 * ("mismo negocio por dos busquedas"): o duplicabas la fila y le escribias dos
 * veces, o guardabas una y perdias la traza de la segunda busqueda.
 * El vinculo negocio<->busqueda vive ahora en `prospecciones`.
 */
export type Negocio = {
  id: string;
  /** place_id de Google. Clave natural mas confiable para dedup. */
  place_id: string | null;
  nombre: string;
  /** Nombre normalizado para dedup (minusculas, sin acentos ni S.A./Corp). */
  nombre_normalizado: string;
  /** Dominio extraido de la web. Segunda senal de dedup. */
  dominio: string | null;
  sitio_web: string | null;
  telefono: string | null;
  direccion: string | null;
  categoria_google: string | null;
  rating: number | null;
  num_resenas: number | null;
  /** 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' */
  estado_negocio: string | null;
  url_maps: string | null;
  creado_en: string;
};

/**
 * UN INTENTO DE PROSPECCION = (negocio x busqueda).
 *
 * FIX DE ARQUITECTURA (a) + (c): esta tabla es la que faltaba. Resuelve dos
 * cosas a la vez:
 *   - es la tabla puente que permite dedup de negocios sin perder trazabilidad
 *   - es donde vive el estado de tuberia, que es por-producto, no por-empresa
 */
export type Prospeccion = {
  id: string;
  negocio_id: string;
  busqueda_id: string;
  estado: EstadoProspeccion;
  /** Fase 4. Ordena, no descarta. */
  score: number | null;
  /** Transparencia: "web profesional - +100 resenas - email corporativo" */
  razon: string | null;
  creada_en: string;
  actualizada_en: string;
};

export type Contacto = {
  id: string;
  negocio_id: string;
  email: string | null;
  telefono: string | null;
  redes: Record<string, string> | null;
  /** Via B1: DONDE salio el dato. 'footer' | 'contacto' | 'mailto' | ... */
  origen_del_correo: string | null;
  /**
   * COMO estaba escrito: venia ofuscado ("x (arroba) y.com") para esquivar bots.
   * Eje distinto de `origen_del_correo`. Senal de que el negocio no quiere
   * correo automatizado — a considerar antes de aprobar envio. Migracion 009.
   */
  email_ofuscado: boolean;
  estado_verificacion: EstadoVerificacion;
  creado_en: string;
};

/**
 * FIX DE ARQUITECTURA (b): el correo cuelga de (prospeccion, contacto).
 *
 * Antes: `correos.negocio_id`.
 * Problema 1: en Panama muchas cadenas tienen N sucursales en Maps con el
 *   MISMO info@. Con negocio_id generabas N borradores al mismo buzon.
 *   La unidad de envio es el EMAIL, no el negocio -> contacto_id.
 * Problema 2: no se podia saber que producto se le ofrecio. Via prospeccion_id
 *   -> busquedas.producto queda gratis.
 */
export type Correo = {
  id: string;
  prospeccion_id: string;
  contacto_id: string;
  asunto: string;
  cuerpo: string;
  cta: string;
  /** Modelo que lo redacto, para trazabilidad. */
  modelo: string;
  /** 'borrador' | 'aprobado' | 'editado' | 'descartado' | 'enviado' */
  estado: string;
  creado_en: string;
};

/**
 * FIX DE ARQUITECTURA (d): lista de supresion (opt-out).
 *
 * No es un tema diferido a B6. El cron de la Fase 7 vuelve a descubrir cada dia
 * los mismos negocios: sin esta tabla, re-contactaria a quien se dio de baja
 * ayer. Una tabla y un check antes de aprobar.
 */
export type Supresion = {
  id: string;
  /** Se suprime por email exacto O por dominio completo. Uno de los dos. */
  email: string | null;
  dominio: string | null;
  motivo: 'opt_out' | 'rebote' | 'queja' | 'manual';
  nota: string | null;
  creada_en: string;
};

/** Lo que devuelve el paso de descubrimiento, ya normalizado. */
export type NegocioDescubierto = Omit<Negocio, 'id' | 'creado_en'>;
