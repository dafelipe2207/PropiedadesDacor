import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaDb, datosBase, crearContrato, uno } from './apoyo/db.js';

const arriendo = async (db, canon, inicio, fin, periodo) =>
  Number((await uno(db, 'select arriendo_proporcional($1,$2,$3,$4) as v', [canon, inicio, fin, periodo])).v);

const cobro = (db, contrato, periodo) => uno(db,
  `select id, total::float8 as total, saldo::float8 as saldo, estado, fecha_limite::text as fecha_limite from cobros where contrato_id=$1 and periodo=$2`,
  [contrato, periodo]);

test('mes completo cobra el canon', async () => {
  const db = await nuevaDb();
  assert.equal(await arriendo(db, 1200000, '2026-01-01', null, '2026-02'), 1200000);
  assert.equal(await arriendo(db, 1200000, '2026-01-01', null, '2026-10'), 1200000);
});

test('inicio el 16 de octubre y fin el 15 de octubre cobran 15/30', async () => {
  const db = await nuevaDb();
  assert.equal(await arriendo(db, 1200000, '2026-10-16', null, '2026-10'), 600000);
  assert.equal(await arriendo(db, 1200000, '2026-01-01', '2026-10-15', '2026-10'), 600000);
  assert.equal(await arriendo(db, 1200000, '2026-11-01', null, '2026-10'), 0);
});

test('generar dos veces no duplica', async () => {
  const db = await nuevaDb();
  const d = await datosBase(db);
  const c = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1 });
  assert.equal(Number((await uno(db, `select generar_cobros('2026-10') as n`)).n), 1);
  assert.equal(Number((await uno(db, `select generar_cobros('2026-10') as n`)).n), 0);
  const k = await cobro(db, c, '2026-10');
  assert.equal(k.total, 1200000);
  assert.equal(k.saldo, 1200000);
  assert.equal(k.estado, 'pendiente');
});

test('servicio cerrado después se agrega al cobro existente', async () => {
  const db = await nuevaDb();
  const d = await datosBase(db);
  const c = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1 });
  await db.query(`select generar_cobros('2026-10')`);
  const s = (await uno(db, `insert into servicios(propiedad_id, tipo, empresa, modalidad, unidad_id) values ($1,'energia','EPM','individual',$2) returning id`, [d.propiedad, d.apto])).id;
  const f = (await uno(db, `insert into facturas_servicio(servicio_id, periodo, valor) values ($1,'2026-10',180000) returning id`, [s])).id;
  await db.query('select cerrar_servicio($1)', [f]);
  assert.equal(Number((await uno(db, `select generar_cobros('2026-10') as n`)).n), 1);
  const k = await cobro(db, c, '2026-10');
  assert.equal(k.total, 1380000);
  const lineas = (await db.query('select concepto, descripcion from lineas_cobro where cobro_id=$1 order by concepto', [k.id])).rows;
  assert.deepEqual(lineas.map((l) => l.concepto), ['arriendo', 'servicio']);
  assert.match(lineas[1].descripcion, /Energía – Apto 201/);
});

test('fecha límite usa el día de pago del contrato', async () => {
  const db = await nuevaDb();
  const d = await datosBase(db);
  const c = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1, dia_pago: 10 });
  await db.query(`select generar_cobros('2026-10')`);
  assert.equal((await cobro(db, c, '2026-10')).fecha_limite, '2026-10-10');
});

test('contrato que empieza después del periodo no genera cobro', async () => {
  const db = await nuevaDb();
  const d = await datosBase(db);
  const c = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1, inicio: '2026-11-01' });
  await db.query(`select generar_cobros('2026-10')`);
  assert.equal(await cobro(db, c, '2026-10'), undefined);
});

test('periodo inválido se rechaza', async () => {
  const db = await nuevaDb();
  await assert.rejects(db.query(`select generar_cobros('2026-13')`), /Periodo inválido/);
});

test('terminar el contrato después de generar recalcula el arriendo de ese mes y de los siguientes', async () => {
  const db = await nuevaDb();
  const d = await datosBase(db);
  const c = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1, inicio: '2026-09-01' });
  await db.query(`select generar_cobros('2026-10')`);
  await db.query(`select generar_cobros('2026-11')`);
  await db.query(`update contratos set estado='terminado', fecha_fin='2026-10-15' where id=$1`, [c]);
  assert.equal((await cobro(db, c, '2026-10')).total, 600000);
  assert.equal((await cobro(db, c, '2026-11')).total, 0);
  assert.equal((await cobro(db, c, '2026-11')).estado, 'pagado');
});

test('la fecha límite nunca es anterior al inicio del contrato', async () => {
  const db = await nuevaDb();
  const d = await datosBase(db);
  const c = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1, inicio: '2026-10-16', dia_pago: 5 });
  await db.query(`select generar_cobros('2026-10')`);
  assert.equal((await cobro(db, c, '2026-10')).fecha_limite, '2026-10-16');
});
