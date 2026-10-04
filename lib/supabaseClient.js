// Inicializa el cliente real de Supabase (solo navegador).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_CLAVE_PUBLICA } from '../config.js';
import { usarCliente } from './cliente.js';

export const configurado = Boolean(SUPABASE_URL && SUPABASE_CLAVE_PUBLICA);

export const supabase = configurado
  ? createClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, { auth: { persistSession: true } })
  : null;

if (supabase) usarCliente(supabase);
