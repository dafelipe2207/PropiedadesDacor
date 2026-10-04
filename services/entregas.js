import { db, q, rpc } from '../lib/cliente.js';

// Recibos vigentes que el administrador aún no ha entregado (o cuya entrega fue rechazada).
export function cajaAdmin(propietarioId = null) {
  let c = db().from('v_caja_admin').select('*');
  if (propietarioId) c = c.eq('propietario_id', propietarioId);
  return q(c.order('numero'));
}

export function registrarEntrega({ propietario_id, fecha = null, pagos }) {
  if (!propietario_id) throw new Error('Seleccione el propietario.');
  if (!pagos?.length) throw new Error('Seleccione al menos un recibo.');
  return rpc('registrar_entrega', { p_propietario: propietario_id, p_fecha: fecha, p_pagos: pagos });
}

export const listarEntregas = () =>
  q(db().from('v_entregas').select('*').order('creado_en', { ascending: false }));

export async function recibosDeEntrega(entregaId) {
  const filas = await q(db().from('entrega_pagos').select('pago_id').eq('entrega_id', entregaId));
  if (!filas.length) return [];
  return q(db().from('v_pagos').select('*').in('id', filas.map((f) => f.pago_id)).order('numero'));
}

export function responderEntrega(id, confirmar, comentario = null) {
  if (!confirmar && !comentario?.trim()) throw new Error('Escriba por qué rechaza la entrega.');
  return rpc('responder_entrega', { p_entrega: id, p_confirmar: confirmar, p_comentario: comentario });
}
