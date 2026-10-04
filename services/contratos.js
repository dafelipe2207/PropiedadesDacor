import { db, q } from '../lib/cliente.js';

export function listarContratos({ estado = null, inquilinoId = null } = {}) {
  let c = db().from('v_contratos').select('*');
  if (estado) c = c.eq('estado', estado);
  if (inquilinoId) c = c.eq('inquilino_id', inquilinoId);
  return q(c.order('propiedad').order('unidad'));
}

export function crearContrato({ unidad_id, inquilino_id, fecha_inicio, canon = null, dia_pago = 5 }) {
  if (!unidad_id) throw new Error('Seleccione la unidad.');
  if (!inquilino_id) throw new Error('Seleccione el inquilino.');
  if (!fecha_inicio) throw new Error('Indique la fecha de inicio.');
  if (!(dia_pago >= 1 && dia_pago <= 28)) throw new Error('El día de pago debe estar entre 1 y 28.');
  const datos = { unidad_id, inquilino_id, fecha_inicio, dia_pago };
  if (canon !== null) datos.canon = canon;
  return q(db().from('contratos').insert(datos).select().single());
}

export function terminarContrato(id, fechaFin) {
  if (!fechaFin) throw new Error('Indique la fecha de terminación.');
  return q(db().from('contratos').update({ estado: 'terminado', fecha_fin: fechaFin }).eq('id', id).select().single());
}
