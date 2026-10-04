import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { nuevaDb, datosBase, crearContrato, crearUsuario, comoUsuario, uno } from './apoyo/db.js';

async function preparar() {
  const db = await nuevaDb();
  const d = await datosBase(db);
  d.c1 = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1, inicio: '2026-01-01' });
  d.admin = await crearUsuario(db, { rol: 'admin' });
  d.dueno = await crearUsuario(db, { rol: 'propietario', propietario_id: d.propietario });
  return { db, d };
}

const pagar = (db, d, valor, contrato = d.c1) => comoUsuario(db, d.admin, (x) =>
  uno(x, 'select id from registrar_pago($1,$2,$3,$4)', [contrato, valor, '2026-01-05', randomUUID()])).then((r) => r.id);

test('v_diferencia_servicios con el ejemplo de la spec', async () => {
  const { db, d } = await preparar();
  await crearContrato(db, { unidad: d.local, inquilino: d.inq2, inicio: '2026-01-01' });
  const s = (await uno(db, `insert into servicios(propiedad_id, tipo, modalidad, medida) values ($1,'energia','compartido','kWh') returning id`, [d.propiedad])).id;
  for (const [u, id, l] of [[d.apto, 'A', 1300], [d.local, 'L', 1550], [d.estudio, 'E', 1000]]) {
    const sc = (await uno(db, `insert into subcontadores(servicio_id, unidad_id, identificador, lectura_inicial) values ($1,$2,$3,1000) returning id`, [s, u, id])).id;
    await db.query(`insert into lecturas(subcontador_id, periodo, lectura) values ($1,'2026-10',$2)`, [sc, l]);
  }
  const f = (await uno(db, `insert into facturas_servicio(servicio_id, periodo, valor, consumo_principal) values ($1,'2026-10',600000,1000) returning id`, [s])).id;
  await db.query('select cerrar_servicio($1)', [f]);
  const r = await comoUsuario(db, d.dueno, (x) => uno(x, 'select servicio, diferencia::float8 as diferencia from v_diferencia_servicios'));
  assert.deepEqual(r, { servicio: 'Energía', diferencia: 90000 });
});

test('v_caja_admin: el recibo sale al entregarlo y vuelve si se rechaza', async () => {
  const { db, d } = await preparar();
  await db.query(`select generar_cobros('2026-01')`);
  const p = await pagar(db, d, 500000);
  const caja = () => comoUsuario(db, d.admin, async (x) => (await x.query('select pago_id from v_caja_admin')).rows.map((r) => r.pago_id));
  assert.deepEqual(await caja(), [p]);
  const e = await comoUsuario(db, d.admin, (x) => uno(x, 'select id from registrar_entrega($1,$2,$3)', [d.propietario, '2026-01-06', [p]]));
  assert.deepEqual(await caja(), []);
  await comoUsuario(db, d.dueno, (x) => x.query('select responder_entrega($1,false,$2)', [e.id, 'No cuadra']));
  assert.deepEqual(await caja(), [p]);
});

test('v_cartera solo muestra cobros vencidos con saldo', async () => {
  const { db, d } = await preparar();
  await db.query(`select generar_cobros('2026-01')`);
  await db.query(`select generar_cobros('2026-02')`);
  await db.query(`select generar_cobros('2099-12')`);
  await pagar(db, d, 1200000);
  const r = await comoUsuario(db, d.admin, async (x) => (await x.query('select periodo, saldo::float8 as saldo, dias_mora from v_cartera')).rows);
  assert.equal(r.length, 1);
  assert.equal(r[0].periodo, '2026-02');
  assert.equal(r[0].saldo, 1200000);
  assert.ok(r[0].dias_mora > 0);
});

test('v_recaudo_mensual y v_ocupacion', async () => {
  const { db, d } = await preparar();
  await db.query(`select generar_cobros('2026-01')`);
  await pagar(db, d, 700000);
  const r = await comoUsuario(db, d.dueno, (x) => uno(x,
    `select tipo_unidad, cobrado_arriendo::float8 as a, cobrado_servicios::float8 as s, recaudado::float8 as r from v_recaudo_mensual where periodo='2026-01'`));
  assert.deepEqual(r, { tipo_unidad: 'apartamento', a: 1200000, s: 0, r: 700000 });
  const o = await comoUsuario(db, d.dueno, (x) => uno(x, 'select total::int as t, ocupadas::int as o from v_ocupacion'));
  assert.deepEqual(o, { t: 3, o: 1 });
});
