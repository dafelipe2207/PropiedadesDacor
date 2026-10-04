import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { nuevaDb, datosBase, crearContrato, crearUsuario, comoUsuario, uno } from './apoyo/db.js';

async function preparar() {
  const db = await nuevaDb();
  const d = await datosBase(db);
  d.c = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1, inicio: '2026-10-01' });
  d.admin = await crearUsuario(db, { rol: 'admin' });
  d.dueno = await crearUsuario(db, { rol: 'propietario', propietario_id: d.propietario });
  await db.query(`select generar_cobros('2026-10')`);
  return { db, d };
}

const comoAdmin = (db, d, sql, params) => comoUsuario(db, d.admin, (x) => uno(x, sql, params));
const pagar = (db, d, valor, contrato = d.c) =>
  comoAdmin(db, d, 'select id from registrar_pago($1,$2,$3,$4)', [contrato, valor, '2026-10-05', randomUUID()]).then((r) => r.id);
const entregar = (db, d, pagos, propietario = d.propietario) =>
  comoAdmin(db, d, 'select id, valor::float8 as valor, estado from registrar_entrega($1,$2,$3)', [propietario, '2026-10-06', pagos]);
const anular = (db, d, pago, motivo = 'Valor mal digitado') =>
  comoAdmin(db, d, 'select anular_recibo($1,$2)', [pago, motivo]);
const responder = (db, uid, entrega, confirmar, comentario = null) =>
  comoUsuario(db, uid, (x) => x.query('select responder_entrega($1,$2,$3)', [entrega, confirmar, comentario]));

test('anular recalcula saldos de los pagos posteriores', async () => {
  const { db, d } = await preparar();
  const p1 = await pagar(db, d, 500000);
  await pagar(db, d, 700000);
  await anular(db, d, p1);
  const k = await uno(db, `select saldo::float8 as s from cobros where contrato_id=$1`, [d.c]);
  assert.equal(k.s, 500000);
  const r = await uno(db, 'select numero::int as n, estado, motivo_anulacion from pagos where id=$1', [p1]);
  assert.deepEqual(r, { n: 1, estado: 'anulado', motivo_anulacion: 'Valor mal digitado' });
});

test('anular exige motivo', async () => {
  const { db, d } = await preparar();
  const p1 = await pagar(db, d, 500000);
  await assert.rejects(anular(db, d, p1, '  '), /motivo/);
});

test('entrega suma los recibos', async () => {
  const { db, d } = await preparar();
  const e = await entregar(db, d, [await pagar(db, d, 500000), await pagar(db, d, 700000)]);
  assert.equal(e.valor, 1200000);
  assert.equal(e.estado, 'pendiente_confirmar');
});

test('un recibo no entra en dos entregas', async () => {
  const { db, d } = await preparar();
  const p = await pagar(db, d, 500000);
  await entregar(db, d, [p]);
  await assert.rejects(entregar(db, d, [p]), /ya está en otra entrega/);
});

test('no se mezclan propietarios', async () => {
  const { db, d } = await preparar();
  const otro = await uno(db, `insert into propietarios(nombre) values ('Otro') returning id`);
  const p = await pagar(db, d, 500000);
  await assert.rejects(entregar(db, d, [p], otro.id), /no pertenece a este propietario/);
});

test('no se entrega un recibo anulado', async () => {
  const { db, d } = await preparar();
  const p = await pagar(db, d, 500000);
  await anular(db, d, p);
  await assert.rejects(entregar(db, d, [p]), /anulado/);
});

test('rechazar devuelve los recibos a caja', async () => {
  const { db, d } = await preparar();
  const p = await pagar(db, d, 500000);
  const e = await entregar(db, d, [p]);
  await assert.rejects(responder(db, d.dueno, e.id, false, null), /comentario/);
  await responder(db, d.dueno, e.id, false, 'Recibí 450.000');
  const e2 = await entregar(db, d, [p]);
  assert.equal(e2.valor, 500000);
});

test('no se anula un recibo de entrega confirmada ni de entrega pendiente', async () => {
  const { db, d } = await preparar();
  const p = await pagar(db, d, 500000);
  const e = await entregar(db, d, [p]);
  await assert.rejects(anular(db, d, p), /pendiente de confirmar/);
  await responder(db, d.dueno, e.id, true);
  await assert.rejects(anular(db, d, p), /entregado y confirmado/);
});

test('otro propietario no puede confirmar', async () => {
  const { db, d } = await preparar();
  const otro = await uno(db, `insert into propietarios(nombre) values ('Otro') returning id`);
  const intruso = await crearUsuario(db, { rol: 'propietario', propietario_id: otro.id });
  const e = await entregar(db, d, [await pagar(db, d, 500000)]);
  await assert.rejects(responder(db, intruso, e.id, true), /Solo el propietario/);
});

test('una entrega ya respondida no se responde de nuevo', async () => {
  const { db, d } = await preparar();
  const e = await entregar(db, d, [await pagar(db, d, 500000)]);
  await responder(db, d.dueno, e.id, true);
  await assert.rejects(responder(db, d.dueno, e.id, false, 'no'), /ya fue respondida/);
});
