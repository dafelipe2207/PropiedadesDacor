import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp } from './apoyo/app.js';
import * as P from '../services/propiedades.js';
import * as Pe from '../services/personas.js';
import * as C from '../services/contratos.js';
import * as K from '../services/cobros.js';
import * as G from '../services/pagos.js';
import { mensajeCobro, mensajeRecibo } from '../lib/whatsapp.js';

async function escenario() {
  await prepararApp();
  const dueno = await Pe.crearPersona('propietarios', { nombre: 'Dueño' });
  const prop = await P.crearPropiedad({ nombre: 'Edificio', propietario_id: dueno.id });
  const apto = await P.crearUnidad({ propiedad_id: prop.id, tipo: 'apartamento', identificador: 'Apto 201', canon: 1200000 });
  const ana = await Pe.crearPersona('inquilinos', { nombre: 'Ana', telefono: '3001234567' });
  const c = await C.crearContrato({ unidad_id: apto.id, inquilino_id: ana.id, fecha_inicio: '2026-10-01', dia_pago: 5 });
  return { dueno, c };
}

test('generar cobros y armar el mensaje de WhatsApp', async () => {
  const { c } = await escenario();
  assert.equal(await K.generarCobros('2026-10'), 1);
  const [k] = await K.listarCobros({ periodo: '2026-10' });
  assert.equal(k.inquilino, 'Ana');
  assert.equal(k.unidad, 'Apto 201');
  assert.equal(k.contrato_id, c.id);
  const lineas = await K.lineasDeCobros([k.id]);
  assert.match(mensajeCobro(k, lineas), /Arriendo Apto 201: \$1\.200\.000/);
});

test('registrar pago con clave repetida da un solo recibo y el recibo muestra quién recibió', async () => {
  const { c } = await escenario();
  await K.generarCobros('2026-10');
  const clave = G.nuevaClave();
  const a = await G.registrarPago({ contrato_id: c.id, valor: 500000, fecha: '2026-10-05', clave });
  const b = await G.registrarPago({ contrato_id: c.id, valor: 500000, fecha: '2026-10-05', clave });
  assert.equal(a.id, b.id);
  const r = await G.obtenerRecibo(a.id);
  assert.equal(r.numero, 1);
  assert.equal(r.inquilino, 'Ana');
  assert.equal(r.recibido_por_nombre, 'Administrador');
  assert.match(mensajeRecibo(r), /Saldo pendiente: \$700\.000/);
  const s = await G.estadoDeCuenta(c.id);
  assert.deepEqual([s.saldo_pendiente, s.saldo_a_favor], [700000, 0]);
});

test('anular un recibo', async () => {
  const { c } = await escenario();
  await K.generarCobros('2026-10');
  const p = await G.registrarPago({ contrato_id: c.id, valor: 500000, fecha: '2026-10-05', clave: G.nuevaClave() });
  await assert.rejects(G.anularRecibo(p.id, ''), /motivo/);
  await G.anularRecibo(p.id, 'Error de digitación');
  const r = await G.obtenerRecibo(p.id);
  assert.equal(r.estado, 'anulado');
  assert.equal((await G.estadoDeCuenta(c.id)).saldo_pendiente, 1200000);
  assert.equal((await G.listarPagos({ contratoId: c.id })).length, 1);
});

test('valores inválidos se rechazan antes de llamar a la base', async () => {
  const { c } = await escenario();
  assert.throws(() => G.registrarPago({ contrato_id: c.id, valor: 0, clave: G.nuevaClave() }), /valor/);
  assert.throws(() => G.registrarPago({ contrato_id: null, valor: 10, clave: G.nuevaClave() }), /contrato/);
});
