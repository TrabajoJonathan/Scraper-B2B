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
import {
  generarBorradores,
  generadorSegunCredenciales,
} from '../../src/servicios/redaccionService.ts';
import { CANALES, type Canal } from '../../src/dominio/tipos.ts';
import {
  clienteConSesion,
  dominioPermitido,
  usuarioParaAuditoria,
} from './sesion.ts';

export type EstadoAccion = { ok: boolean; mensaje?: string };

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

export async function accionEntrar(
  _previo: EstadoAccion | null,
  datos: FormData,
): Promise<EstadoAccion> {
  const email = String(datos.get('email') ?? '').trim();
  const password = String(datos.get('password') ?? '');
  const volver = String(datos.get('volver') ?? '/');

  if (email === '' || password === '') {
    return { ok: false, mensaje: 'Faltan el correo o la contraseña.' };
  }

  // Se revisa el dominio ANTES de autenticar: si la cuenta no debería existir,
  // no hace falta ni consultar si la contraseña es correcta.
  if (!dominioPermitido(email)) {
    return { ok: false, mensaje: 'Ese correo no tiene acceso a esta herramienta.' };
  }

  const supabase = await clienteConSesion();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error !== null) {
    // Mensaje genérico a propósito: distinguir "no existe la cuenta" de
    // "contraseña incorrecta" le confirmaría a un desconocido qué correos son
    // empleados de la empresa.
    return { ok: false, mensaje: 'Correo o contraseña incorrectos.' };
  }

  // Solo rutas internas: un `volver` con URL externa sería un redirect abierto.
  redirect(volver.startsWith('/') ? volver : '/');
}

export async function accionSalir(): Promise<void> {
  const supabase = await clienteConSesion();
  await supabase.auth.signOut();
  redirect('/login');
}

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
    (await usuarioParaAuditoria()).email,
  );

  redirect(`/corridas/${corridaId}`);
}

export async function accionAprobar(datos: FormData): Promise<void> {
  const correoId = String(datos.get('correoId') ?? '');
  const r = await aprobar(correoId, await usuarioParaAuditoria());
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
  await descartar(correoId, await usuarioParaAuditoria(), motivo === '' ? undefined : motivo);
  revalidatePath('/revision');
}

/**
 * Genera borradores para lo que el empleado tildó en /leads.
 *
 * El punto de control humano que reemplaza al viejo filtro automático de
 * verificación: antes redactar era un paso que corría solo para todo lo
 * `verificado` de una búsqueda; ahora corre solo para lo que alguien eligió a
 * mano, sin importar de qué búsqueda venga cada lead — por eso recibe una
 * lista de prospecciones sueltas y no un `busquedaId`.
 *
 * Los checkboxes vienen todos con el mismo `name="prospeccionId"`:
 * `getAll()` es exactamente cómo el navegador junta varios valores del mismo
 * nombre en un formulario nativo, sin que haga falta JavaScript para eso.
 */
export async function accionGenerarBorradores(datos: FormData): Promise<void> {
  const ids = datos.getAll('prospeccionId').map(String);
  if (ids.length === 0) return; // nada seleccionado: no hay nada que hacer

  const generador = await generadorSegunCredenciales();
  await generarBorradores(ids, generador === undefined ? {} : { generador });

  redirect('/revision');
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
    await usuarioParaAuditoria(),
  );
  revalidatePath('/revision');
}
