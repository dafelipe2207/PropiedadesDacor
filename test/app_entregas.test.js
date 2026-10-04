import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, entrarComo } from './apoyo/app.js';
import * as P from '../services/propiedades.js';
import * as Pe from '../services/personas.js';
import * as C from '../services/contratos.js';
import * as K from '../services/cobros.js';
import * as G from '../services/pagos.js';
import * as E from '../services/entregas.js';
import * as R from '../services/reportes.js';

async function escenario() {
  const { cliente } = await prepararApp();
  const dueno = await Pe.crearPersona('propietarios', { nombre: 'Dueño' });
  const prop = await P.crearPropiedad({ nombre: 'Edificio', propietario_id: dueno.id });
  const apto = await P.crearUnidad({ propiedad_id: prop.id, tipo: 'apartamento', identificador: 'Apto 201', canon: 1200000 });
  await P.crearUnidad({ propiedad_id: prop.id, tipo: 'local', identificador: 'Local 1', canon: 2000000 });
  const ana = await Pe.crearPersona('inquilinos', { nombre: 'Ana' });
  const c = await C.crearContrato({ unidad_id: apto.id, inquilino_id: ana.id, fecha_inicio: '2026-01-01' });
  await K.generarCobros('2026-01');
  await K.generarCobros('2026-02');
  const p1 = await G.registrarPago({ contrato_id: c.id, valor: 1200000, fecha: '2026-01-05', clave: G.nuevaClave() });
  const p2 = await G.registrarPago({ contrato_id: c.id, valor: 500000, fecha: '2026-02-05', clave: G.nuevaClave() });
  await cliente.registrarUsuario('dueno@p.co', 'clave1234', { rol: 'propietario', propietario_id: dueno.id });
  await cliente.registrarUsuario('ana@p.co', 'clave1234', { rol: 'inquilino', inquilino_id: ana.id });
  return { cliente, dueno, c, p1, p2 };
}

test('caja, entrega y confirmación cuadran para admin y propietario', async () => {
  const { cliente, dueno, p1, p2 } = await escenario();
  const caja = await E.cajaAdmin();
  assert.deepEqual(caja.map((x) => x.numero).sort(), [1, 2]);
  const e = await E.registrarEntrega({ propietario_id: dueno.id, fecha: '2026-02-06', pagos: [p1.id, p2.id] });
  assert.equal(e.valor, 1700000);
  assert.equal((await E.cajaAdmin()).length, 0);

  await entrarComo(cliente, 'dueno@p.co');
  const [vista] = await E.listarEntregas();
  assert.deepEqual([vista.valor, vista.estado, vista.recibos], [1700000, 'pendiente_confirmar', 2]);
  assert.deepEqual((await E.recibosDeEntrega(vista.id)).map((r) => r.numero).sort(), [1, 2]);
  await E.responderEntrega(vista.id, true);
  assert.equal((await E.listarEntregas())[0].estado, 'confirmada');
  const resumen = await R.resumenPropietario();
  assert.equal(resumen.en_caja_admin, 0);
  assert.equal(resumen.entregado_confirmado, 1700000);

  await entrarComo(cliente, 'admin@prueba.co');
  assert.equal((await E.listarEntregas())[0].estado, 'confirmada');
});

test('el propietario ve cartera, recaudo y ocupación de lo suyo', async () => {
  const { cliente } = await escenario();
  await entrarComo(cliente, 'dueno@p.co');
  const cartera = await R.cartera();
  assert.deepEqual(cartera.map((k) => [k.periodo, k.saldo]), [['2026-02', 700000]]);
  const recaudo = await R.recaudo('2026-01');
  assert.deepEqual(recaudo.map((r) => [r.tipo_unidad, r.cobrado_arriendo, r.recaudado]), [['apartamento', 1200000, 1200000]]);
  const ocup = await R.ocupacion();
  assert.deepEqual([ocup[0].total, ocup[0].ocupadas], [2, 1]);
  const resumen = await R.resumenPropietario();
  assert.equal(resumen.en_caja_admin, 1700000);
});

test('el inquilino ve su estado de cuenta', async () => {
  const { cliente, c } = await escenario();
  await entrarComo(cliente, 'ana@p.co');
  const cuenta = await R.estadoCuentaInquilino();
  assert.equal(cuenta.length, 1);
  assert.equal(cuenta[0].contrato.id, c.id);
  assert.deepEqual(cuenta[0].cobros.map((k) => [k.periodo, k.saldo]), [['2026-02', 700000], ['2026-01', 0]]);
  assert.equal(cuenta[0].pagos.length, 2);
  assert.equal(cuenta[0].saldo_pendiente, 700000);
  assert.equal(cuenta[0].lineas.length, 2);
});
