import { db, q } from '../lib/cliente.js';

export const listarPropiedades = () => q(db().from('propiedades').select('*').order('nombre'));

export function crearPropiedad({ nombre, direccion, ciudad, propietario_id }) {
  if (!nombre) throw new Error('Escriba el nombre de la propiedad.');
  if (!propietario_id) throw new Error('Seleccione el propietario.');
  return q(db().from('propiedades').insert({ nombre, direccion, ciudad, propietario_id }).select().single());
}

export const actualizarPropiedad = (id, { nombre, direccion, ciudad, propietario_id }) =>
  q(db().from('propiedades').update({ nombre, direccion, ciudad, propietario_id }).eq('id', id).select().single());

export function listarUnidades(propiedadId = null) {
  let c = db().from('v_unidades').select('*');
  if (propiedadId) c = c.eq('propiedad_id', propiedadId);
  return q(c.order('propiedad').order('identificador'));
}

function validarUnidad({ tipo, identificador, canon }) {
  if (!['apartamento', 'apartaestudio', 'local'].includes(tipo)) throw new Error('Seleccione el tipo de unidad.');
  if (!identificador) throw new Error('Escriba el identificador de la unidad (ej. Apto 201).');
  if (canon === null || canon === undefined || Number.isNaN(canon) || canon < 0) throw new Error('Escriba un canon válido.');
}

export function crearUnidad({ propiedad_id, tipo, identificador, canon }) {
  validarUnidad({ tipo, identificador, canon });
  return q(db().from('unidades').insert({ propiedad_id, tipo, identificador, canon }).select().single());
}

export function actualizarUnidad(id, { tipo, identificador, canon, estado }) {
  validarUnidad({ tipo, identificador, canon });
  const cambios = { tipo, identificador, canon };
  if (estado) cambios.estado = estado;
  return q(db().from('unidades').update(cambios).eq('id', id).select().single());
}
