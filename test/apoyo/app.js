// Prepara la app contra PGlite con el cliente simulado y un administrador con sesión iniciada.
import { nuevaDb } from './db.js';
import { crearClienteFalso, PARSERS } from './supabaseFalso.js';
import { usarCliente } from '../../lib/cliente.js';

export async function prepararApp() {
  const pg = await nuevaDb({ parsers: PARSERS });
  const cliente = crearClienteFalso(pg);
  usarCliente(cliente);
  await cliente.registrarUsuario('admin@prueba.co', 'clave1234', { rol: 'admin' });
  await cliente.auth.signInWithPassword({ email: 'admin@prueba.co', password: 'clave1234' });
  return { pg, cliente };
}

// Cambia la sesión a otro usuario registrado.
export async function entrarComo(cliente, correo, contrasena = 'clave1234') {
  await cliente.auth.signOut();
  const r = await cliente.auth.signInWithPassword({ email: correo, password: contrasena });
  if (r.error) throw new Error(r.error.message);
}
