import { db, q } from '../lib/cliente.js';
import { listarContratos } from './contratos.js';

const suma = (xs, campo) => xs.reduce((s, x) => s + (x[campo] ?? 0), 0);

export const recaudo = (periodo) =>
  q(db().from('v_recaudo_mensual').select('*').eq('periodo', periodo).order('tipo_unidad'));

export const cartera = () => q(db().from('v_cartera').select('*').order('fecha_limite'));

export const diferencias = (periodo = null) => {
  let c = db().from('v_diferencia_servicios').select('*');
  if (periodo) c = c.eq('periodo', periodo);
  return q(c.order('periodo', { ascending: false }));
};

export const ocupacion = () => q(db().from('v_ocupacion').select('*'));

// Cifras de efectivo del propietario: en manos del administrador, por confirmar y confirmado.
export async function resumenPropietario() {
  const [caja, entregas] = await Promise.all([q(db().from('v_caja_admin').select('valor')), q(db().from('v_entregas').select('valor, estado'))]);
  return {
    en_caja_admin: suma(caja, 'valor'),
    por_confirmar: suma(entregas.filter((e) => e.estado === 'pendiente_confirmar'), 'valor'),
    entregado_confirmado: suma(entregas.filter((e) => e.estado === 'confirmada'), 'valor'),
  };
}

// Estado de cuenta de cada contrato visible para el inquilino (el actual primero).
export async function estadoCuentaInquilino() {
  const contratos = await listarContratos();
  contratos.sort((a, b) => (a.estado === b.estado ? b.fecha_inicio.localeCompare(a.fecha_inicio) : a.estado === 'activo' ? -1 : 1));
  return Promise.all(contratos.map(async (contrato) => {
    const [cobros, pagos] = await Promise.all([
      q(db().from('v_cobros').select('*').eq('contrato_id', contrato.id).order('periodo', { ascending: false })),
      q(db().from('v_pagos').select('*').eq('contrato_id', contrato.id).order('numero', { ascending: false })),
    ]);
    const lineas = cobros.length ? await q(db().from('lineas_cobro').select('*').in('cobro_id', cobros.map((k) => k.id))) : [];
    return { contrato, cobros, pagos, lineas, saldo_pendiente: suma(cobros, 'saldo') };
  }));
}
