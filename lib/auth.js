import { supabase, q } from './supabaseClient.js';

export async function sesionActual() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function iniciarSesion(correo, contrasena) {
  return q(supabase.auth.signInWithPassword({ email: correo.trim(), password: contrasena }));
}

export async function cerrarSesion() {
  await supabase.auth.signOut();
}

export async function enviarRecuperacion(correo) {
  const destino = location.origin + location.pathname;
  return q(supabase.auth.resetPasswordForEmail(correo.trim(), { redirectTo: destino }));
}

export async function cambiarContrasena(nueva) {
  if (!nueva || nueva.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  return q(supabase.auth.updateUser({ password: nueva }));
}

export async function miPerfil(uid) {
  const perfil = await q(supabase.from('perfiles').select('*').eq('id', uid).maybeSingle());
  if (!perfil) throw new Error('Su usuario no tiene un perfil asignado. Contacte al administrador.');
  return perfil;
}
