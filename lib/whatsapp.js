// Enlaces y mensajes de WhatsApp (se abren en WhatsApp Business si es la app predeterminada del celular).
import { formatoPesos, formatoFecha, nombrePeriodo } from './formato.js';

// Celular colombiano → '57' + 10 dígitos que empiezan por 3. Fijos y números inválidos → null.
export function telefonoWhatsApp(tel) {
  let d = String(tel ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  if (d.length !== 10 || !d.startsWith('3')) return null;
  return '57' + d;
}

export function enlaceWhatsApp(tel, mensaje) {
  const numero = telefonoWhatsApp(tel);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

export function mensajeCobro(cobro, lineas) {
  const detalle = lineas.map((l) => `• ${l.descripcion}: ${formatoPesos(l.valor)}`).join('\n');
  const yaPagado = Number(cobro.total) - Number(cobro.saldo);
  return [
    `Hola ${cobro.inquilino}, este es el cobro de ${nombrePeriodo(cobro.periodo)} para ${cobro.unidad}:`,
    '',
    detalle,
    '',
    `Total: ${formatoPesos(cobro.total)}`,
    yaPagado > 0 ? `Abonado: ${formatoPesos(yaPagado)}\nPor pagar: ${formatoPesos(cobro.saldo)}` : null,
    `Fecha límite de pago: ${formatoFecha(cobro.fecha_limite)}`,
    '',
    'Gracias.',
  ].filter((x) => x !== null).join('\n');
}

export function mensajeRecibo(pago) {
  const d = pago.detalle ?? {};
  return [
    `Hola ${pago.inquilino}, recibimos su pago en efectivo.`,
    '',
    `Recibo de caja N.º ${pago.numero}`,
    `Fecha: ${formatoFecha(pago.fecha)}`,
    `Unidad: ${pago.unidad}`,
    `Valor: ${formatoPesos(pago.valor)}`,
    `Saldo pendiente: ${formatoPesos(d.saldo_pendiente ?? 0)}`,
    Number(d.saldo_a_favor) > 0 ? `Saldo a favor: ${formatoPesos(d.saldo_a_favor)}` : null,
    '',
    'Gracias.',
  ].filter((x) => x !== null).join('\n');
}

export function mensajeMora(cartera) {
  return [
    `Hola ${cartera.inquilino}, le recordamos que el cobro de ${nombrePeriodo(cartera.periodo)} de ${cartera.unidad}`,
    `tiene un saldo pendiente de ${formatoPesos(cartera.saldo)} (${cartera.dias_mora} días de atraso).`,
    '',
    'Por favor póngase al día. Gracias.',
  ].join('\n');
}
