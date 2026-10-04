import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_CLAVE_PUBLICA } from '../config.js';

export const configurado = Boolean(SUPABASE_URL && SUPABASE_CLAVE_PUBLICA);

export const supabase = configurado
  ? createClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, { auth: { persistSession: true } })
  : null;

// Ejecuta una consulta de Supabase y lanza un Error en español si falla.
export async function q(promesa) {
  const { data, error } = await promesa;
  if (error) throw new Error(traducirError(error));
  return data;
}

export function rpc(nombre, params) {
  return q(supabase.rpc(nombre, params));
}

function traducirError(error) {
  const m = error.message || '';
  if (error.code === '23505') return 'Ya existe un registro con esos datos.';
  if (error.code === '23503') return 'No se puede completar: hay registros relacionados.';
  if (error.code === '42501' || /row-level security/i.test(m)) return 'No tiene permiso para hacer esto.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No hay conexión. Revise internet e intente de nuevo.';
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  return m || 'Ocurrió un error inesperado.';
}
