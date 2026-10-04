import { db, q, rpc } from '../lib/cliente.js';

// Clave única por intento de pago: si el botón se oprime dos veces, la base devuelve el mismo recibo.
export const nuevaClave = () => crypto.randomUUID();

export function registrarPago({ contrato_id, valor, fecha = null, clave }) {
  if (!contrato_id) throw new Error('Seleccione el contrato.');
  if (!(valor > 0)) throw new Error('Escriba el valor recibido.');
  return rpc('registrar_pago', { p_contrato: contrato_id, p_valor: valor, p_fecha: fecha, p_clave: clave });
}

export function listarPagos({ contratoId = null, desde = null, propiedadId = null } = {}) {
  let c = db().from('v_pagos').select('*');
  if (contratoId) c = c.eq('contrato_id', contratoId);
  if (propiedadId) c = c.eq('propiedad_id', propiedadId);
  if (desde) c = c.gte('fecha', desde);
  return q(c.order('numero', { ascending: false }));
}

export const obtenerRecibo = (id) => q(db().from('v_pagos').select('*').eq('id', id).single());

export async function anularRecibo(id, motivo) {
  if (!motivo || !motivo.trim()) throw new Error('Indique el motivo de la anulación.');
  return rpc('anular_recibo', { p_pago: id, p_motivo: motivo });
}

// Saldo pendiente y saldo a favor actuales de un contrato.
export async function estadoDeCuenta(contratoId) {
  const [cobros, aFavor] = await Promise.all([
    q(db().from('cobros').select('saldo').eq('contrato_id', contratoId)),
    rpc('saldo_a_favor', { p_contrato: contratoId }),
  ]);
  return { saldo_pendiente: cobros.reduce((s, k) => s + k.saldo, 0), saldo_a_favor: aFavor };
}
