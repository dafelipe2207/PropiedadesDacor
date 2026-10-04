import { db, q } from './cliente.js';

export async function sesionActual() {
  const { data } = await db().auth.getSession();
  return data.session;
}

export async function iniciarSesion(correo, contrasena) {
  return q(db().auth.signInWithPassword({ email: correo.trim(), password: contrasena }));
}

export async function cerrarSesion() {
  await db().auth.signOut();
}

export async function enviarRecuperacion(correo) {
  const destino = location.origin + location.pathname;
  return q(db().auth.resetPasswordForEmail(correo.trim(), { redirectTo: destino }));
}

export async function cambiarContrasena(nueva) {
  if (!nueva || nueva.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  return q(db().auth.updateUser({ password: nueva }));
}

export async function miPerfil(uid) {
  const perfil = await q(db().from('perfiles').select('*').eq('id', uid).maybeSingle());
  if (!perfil) throw new Error('Su usuario no tiene un perfil asignado. Contacte al administrador.');
  return perfil;
}
