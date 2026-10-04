// Detecta si la página se abrió desde un enlace de correo de Supabase (invitación o recuperación).
// Debe leerse antes de crear el cliente, que limpia la URL al procesar la sesión.
export function tipoEnlaceAuth(hash = '', search = '') {
  const p = new URLSearchParams(`${hash.replace(/^#/, '')}&${search.replace(/^\?/, '')}`);
  if (p.get('error_code') || (p.get('error') && !p.get('type'))) return 'vencido';
  const tipo = p.get('type');
  return tipo === 'invite' || tipo === 'recovery' ? tipo : null;
}
