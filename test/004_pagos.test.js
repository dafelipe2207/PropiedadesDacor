import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { nuevaDb, datosBase, crearContrato, crearUsuario, comoUsuario, uno } from './apoyo/db.js';

async function preparar(inicio = '2026-10-01') {
  const db = await nuevaDb();
  const d = await datosBase(db);
  d.c = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1, inicio });
  d.admin = await crearUsuario(db, { rol: 'admin' });
  return { db, d };
}

const pagar = (db, d, valor, fecha = '2026-10-05', clave = randomUUID()) =>
  comoUsuario(db, d.admin, (x) => uno(x,
    'select id, numero::int as numero, recibido_por, detalle from registrar_pago($1,$2,$3,$4)',
    [d.c, valor, fecha, clave]));

const cobro = (db, d, periodo) => uno(db,
  'select saldo::float8 as saldo, estado from cobros where contrato_id=$1 and periodo=$2', [d.c, periodo]);

test('recibos consecutivos', async () => {
  const { db, d } = await preparar();
  await db.query(`select generar_cobros('2026-10')`);
  const nums = [];
  for (let i = 0; i < 3; i++) nums.push((await pagar(db, d, 100000)).numero);
  assert.deepEqual(nums, [1, 2, 3]);
});

test('misma clave no duplica', async () => {
  const { db, d } = await preparar();
  await db.query(`select generar_cobros('2026-10')`);
  const clave = randomUUID();
  const a = await pagar(db, d, 500000, '2026-10-05', clave);
  const b = await pagar(db, d, 500000, '2026-10-05', clave);
  assert.equal(a.id, b.id);
  assert.equal(Number((await uno(db, 'select count(*) as n from pagos')).n), 1);
});

test('pago parcial', async () => {
  const { db, d } = await preparar();
  await db.query(`select generar_cobros('2026-10')`);
  const p = await pagar(db, d, 500000);
  assert.equal(p.recibido_por, d.admin);
  assert.deepEqual(await cobro(db, d, '2026-10'), { saldo: 700000, estado: 'parcial' });
  assert.equal(p.detalle.saldo_pendiente, 700000);
  assert.equal(p.detalle.conceptos[0].valor, 500000);
});

test('paga primero lo más antiguo', async () => {
  const { db, d } = await preparar('2026-09-01');
  await db.query(`select generar_cobros('2026-09')`);
  await db.query(`select generar_cobros('2026-10')`);
  await pagar(db, d, 1500000);
  assert.deepEqual(await cobro(db, d, '2026-09'), { saldo: 0, estado: 'pagado' });
  assert.deepEqual(await cobro(db, d, '2026-10'), { saldo: 900000, estado: 'parcial' });
});

test('sobrante queda a favor y se aplica al siguiente cobro', async () => {
  const { db, d } = await preparar();
  await db.query(`select generar_cobros('2026-10')`);
  await pagar(db, d, 1500000);
  assert.equal(Number((await uno(db, 'select saldo_a_favor($1) as v', [d.c])).v), 300000);
  await db.query(`select generar_cobros('2026-11')`);
  assert.deepEqual(await cobro(db, d, '2026-11'), { saldo: 900000, estado: 'parcial' });
  assert.equal(Number((await uno(db, 'select saldo_a_favor($1) as v', [d.c])).v), 0);
});

test('no admin no puede registrar pagos', async () => {
  const { db, d } = await preparar();
  const inq = await crearUsuario(db, { rol: 'inquilino', inquilino_id: d.inq1 });
  await assert.rejects(comoUsuario(db, inq, (x) =>
    x.query('select registrar_pago($1,$2,$3,$4)', [d.c, 1000, '2026-10-05', randomUUID()])), /Solo el administrador/);
});

test('valor cero o negativo se rechaza', async () => {
  const { db, d } = await preparar();
  await assert.rejects(pagar(db, d, 0), /mayor que cero/);
});
