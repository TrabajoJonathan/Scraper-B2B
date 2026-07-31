'use server';

/**
 * Server Actions — el puente entre la interfaz y los servicios que ya existen.
 *
 * Fijate que acá no hay lógica de negocio: cada acción valida la entrada del
 * formulario, llama a un servicio y refresca la pantalla. Toda la decisión sigue
 * viviendo en `src/servicios/`.
 *
 * Eso es lo que hizo que la Fase 6 sea andamiaje y no reescritura: el pipeline
 * ya estaba escrito para ser llamado desde cualquier lado, y los scripts de
 * prueba eran solo el primer llamador.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { crearCorrida } from '../../src/servicios/corridaService.ts';
import { aprobar, editar, descartar } from '../../src/servicios/revisionService.ts';
import { CANALES, type Canal } from '../../src/dominio/tipos.ts';
import { usuarioActual } from './usuario.ts';

export type EstadoAccion = { ok: boolean; mensaje?: string };

/**
 * Encarga una corrida. NO la ejecuta.
 *
 * Esto es la consecuencia directa del límite de Vercel: el pipeline tarda
 * minutos y una función serverless se corta en decenas de segundos. Así que el
 * botón registra el trabajo y responde al instante; el cron lo va avanzando.
 */
export async function accionCrearCorrida(
  _previo: EstadoAccion | null,
  datos: FormData,
): Promise<EstadoAccion> {
  const producto = String(datos.get('producto') ?? '').trim();
  const categoria = String(datos.get('categoria') ?? '').trim();
  const ubicacion = String(datos.get('ubicacion') ?? '').trim();
  const canalCrudo = String(datos.get('canal') ?? 'google_maps');

  if (producto === '' || categoria === '' || ubicacion === '') {
    return { ok: false, mensaje: 'Producto, categoría y ubicación son obligatorios.' };
  }
  if (!CANALES.includes(canalCrudo as Canal)) {
    return { ok: false, mensaje: 'Canal inválido.' };
  }

  const { corridaId } = await crearCorrida(
    { producto, categoria, ubicacion, canal: canalCrudo as Canal },
    usuarioActual().email,
  );

  redirect(`/corridas/${corridaId}`);
}

export async function accionAprobar(datos: FormData): Promise<void> {
  const correoId = String(datos.get('correoId') ?? '');
  const r = await aprobar(correoId, usuarioActual());
  // No lanzamos si falla: que un correo no sea aprobable es parte del flujo
  // normal (opt-out posterior, email sin verificar). La pantalla lo muestra.
  if (!r.ok) {
    console.warn(`[revision] no se aprobó ${correoId}: ${r.motivo} ${r.detalle ?? ''}`);
  }
  revalidatePath('/revision');
}

export async function accionDescartar(datos: FormData): Promise<void> {
  const correoId = String(datos.get('correoId') ?? '');
  const motivo = String(datos.get('motivo') ?? '').trim();
  await descartar(correoId, usuarioActual(), motivo === '' ? undefined : motivo);
  revalidatePath('/revision');
}

export async function accionEditar(datos: FormData): Promise<void> {
  const correoId = String(datos.get('correoId') ?? '');
  const asunto = String(datos.get('asunto') ?? '').trim();
  const cuerpo = String(datos.get('cuerpo') ?? '').trim();
  await editar(
    correoId,
    {
      ...(asunto === '' ? {} : { asunto }),
      ...(cuerpo === '' ? {} : { cuerpo }),
    },
    usuarioActual(),
  );
  revalidatePath('/revision');
}
