// Inicializa el cliente real de Supabase (solo navegador).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_CLAVE_PUBLICA } from '../config.js';
import { usarCliente } from './cliente.js';
import { tipoEnlaceAuth } from './enlaces.js';

// Se lee antes de crear el cliente, que limpia la URL al procesar el enlace.
export const tipoEnlace = tipoEnlaceAuth(location.hash, location.search);

export const configurado = Boolean(SUPABASE_URL && SUPABASE_CLAVE_PUBLICA);

export const supabase = configurado
  ? createClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, { auth: { persistSession: true } })
  : null;

if (supabase) usarCliente(supabase);
