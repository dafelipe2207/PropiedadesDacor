import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telefonoWhatsApp, enlaceWhatsApp, mensajeCobro, mensajeRecibo, mensajeMora } from '../lib/whatsapp.js';

test('telefonoWhatsApp normaliza celulares colombianos', () => {
  for (const t of ['300 123 4567', '300-123-4567', '+57 3001234567', '573001234567', '(300) 123 4567']) {
    assert.equal(telefonoWhatsApp(t), '573001234567', t);
  }
  assert.equal(telefonoWhatsApp('12345'), null);
  assert.equal(telefonoWhatsApp(''), null);
  assert.equal(telefonoWhatsApp(null), null);
  assert.equal(telefonoWhatsApp('6041234567'), null); // fijo, no tiene WhatsApp
});

test('enlaceWhatsApp codifica el mensaje', () => {
  assert.equal(enlaceWhatsApp('3001234567', 'Hola & gracias'), 'https://wa.me/573001234567?text=Hola%20%26%20gracias');
  assert.equal(enlaceWhatsApp('123', 'x'), null);
});

test('mensajeCobro detalla líneas y total', () => {
  const m = mensajeCobro(
    { inquilino: 'Ana', unidad: 'Apto 201', periodo: '2026-10', total: 1380000, saldo: 1380000, fecha_limite: '2026-10-05' },
    [{ descripcion: 'Arriendo Apto 201', valor: 1200000 }, { descripcion: 'Energía – Apto 201 – 300 kWh', valor: 180000 }]);
  assert.match(m, /Hola Ana/);
  assert.match(m, /octubre de 2026/);
  assert.match(m, /Arriendo Apto 201: \$1\.200\.000/);
  assert.match(m, /Total: \$1\.380\.000/);
  assert.match(m, /05\/10\/2026/);
});

test('mensajeRecibo incluye número, valor y saldo', () => {
  const m = mensajeRecibo({ numero: 7, inquilino: 'Ana', unidad: 'Apto 201', fecha: '2026-10-05', valor: 500000,
    detalle: { saldo_pendiente: 880000, saldo_a_favor: 0 } });
  assert.match(m, /Recibo de caja N\.º 7/);
  assert.match(m, /\$500\.000/);
  assert.match(m, /Saldo pendiente: \$880\.000/);
});

test('mensajeMora', () => {
  const m = mensajeMora({ inquilino: 'Ana', unidad: 'Apto 201', periodo: '2026-09', saldo: 300000, dias_mora: 12 });
  assert.match(m, /septiembre de 2026/);
  assert.match(m, /\$300\.000/);
  assert.match(m, /12 días/);
});
