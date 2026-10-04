import { db, q, rpc } from '../lib/cliente.js';

export function listarCobros({ periodo = null, contratoId = null, propiedadId = null } = {}) {
  let c = db().from('v_cobros').select('*');
  if (periodo) c = c.eq('periodo', periodo);
  if (contratoId) c = c.eq('contrato_id', contratoId);
  if (propiedadId) c = c.eq('propiedad_id', propiedadId);
  return q(c.order('periodo', { ascending: false }).order('propiedad').order('unidad'));
}

export function lineasDeCobros(cobroIds) {
  if (!cobroIds.length) return Promise.resolve([]);
  return q(db().from('lineas_cobro').select('*').in('cobro_id', cobroIds).order('concepto').order('descripcion'));
}

export const generarCobros = (periodo) => rpc('generar_cobros', { p_periodo: periodo });
