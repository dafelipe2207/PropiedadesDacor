import { db, q } from '../lib/cliente.js';
import { telefonoWhatsApp } from '../lib/whatsapp.js';

function validarPersona({ nombre, telefono }) {
  if (!nombre) throw new Error('Escriba el nombre.');
  if (telefono && !telefonoWhatsApp(telefono)) throw new Error('El celular debe tener 10 dígitos y empezar por 3.');
}

const campos = ({ nombre, documento, telefono, correo }) => ({ nombre, documento, telefono, correo });

export const listarPropietarios = () => q(db().from('propietarios').select('*').order('nombre'));
export const listarInquilinos = () => q(db().from('inquilinos').select('*').order('nombre'));

export function crearPersona(tipo, datos) {
  validarPersona(datos);
  return q(db().from(tipo).insert(campos(datos)).select().single());
}

export function actualizarPersona(tipo, id, datos) {
  validarPersona(datos);
  return q(db().from(tipo).update(campos(datos)).eq('id', id).select().single());
}

// Perfiles con acceso a la app (para mostrar quién ya tiene usuario).
export const listarAccesos = () => q(db().from('perfiles').select('id, rol, propietario_id, inquilino_id'));

// Crea el usuario de acceso y le envía una invitación por correo (función del servidor).
export async function crearAcceso({ correo, rol, propietario_id = null, inquilino_id = null }) {
  if (!correo) throw new Error('La persona necesita un correo para tener acceso.');
  const redirigir = typeof location !== 'undefined' ? location.origin + location.pathname : null;
  const { data, error } = await db().functions.invoke('crear-usuario', { body: { correo, rol, propietario_id, inquilino_id, redirigir } });
  if (error) {
    let mensaje = error.message;
    try { const cuerpo = await error.context?.json(); if (cuerpo?.error) mensaje = cuerpo.error; } catch { /* sin cuerpo */ }
    throw new Error(mensaje);
  }
  return data;
}
