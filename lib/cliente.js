// Cliente de datos compartido. En el navegador lo inicializa lib/supabaseClient.js;
// en las pruebas se inyecta un cliente simulado con usarCliente().
let cliente = null;

export function usarCliente(c) {
  cliente = c;
}

export function db() {
  if (!cliente) throw new Error('La aplicación aún no tiene configurada la base de datos.');
  return cliente;
}

// Ejecuta una consulta y lanza un Error en español si falla.
export async function q(promesa) {
  const { data, error } = await promesa;
  if (error) throw new Error(traducirError(error));
  return data;
}

export function rpc(nombre, params = {}) {
  return q(db().rpc(nombre, params));
}

export function traducirError(error) {
  const m = error.message || '';
  if (error.code === '23505') return 'Ya existe un registro con esos datos.';
  if (error.code === '23503') return 'No se puede completar: hay registros relacionados.';
  if (error.code === '23514') return 'Hay un dato que no cumple las reglas (revise los valores).';
  if (error.code === '42501' || /row-level security|permission denied/i.test(m)) return 'No tiene permiso para hacer esto.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No hay conexión. Revise internet e intente de nuevo.';
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  return m || 'Ocurrió un error inesperado.';
}
