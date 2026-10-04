import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaDb, datosBase, crearContrato, uno } from './apoyo/db.js';

// Energía compartida: Apto 201 y Local 1 con contrato, Estudio 301 conectado y desocupado.
async function energiaCompartida(db) {
  const d = await datosBase(db);
  d.cApto = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1 });
  d.cLocal = await crearContrato(db, { unidad: d.local, inquilino: d.inq2 });
  d.servicio = (await uno(db, `insert into servicios(propiedad_id, tipo, empresa, numero_cuenta, modalidad, medida)
    values ($1,'energia','EPM','123','compartido','kWh') returning id`, [d.propiedad])).id;
  const sub = async (unidad, ident) => (await uno(db,
    `insert into subcontadores(servicio_id, unidad_id, identificador, lectura_inicial) values ($1,$2,$3,1000) returning id`,
    [d.servicio, unidad, ident])).id;
  d.sApto = await sub(d.apto, 'SC-201');
  d.sLocal = await sub(d.local, 'SC-L1');
  d.sEstudio = await sub(d.estudio, 'SC-301');
  return d;
}

const factura = (db, servicio, periodo, valor, consumo) => uno(db,
  `insert into facturas_servicio(servicio_id, periodo, valor, consumo_principal, vencimiento) values ($1,$2,$3,$4,'2026-10-20') returning id`,
  [servicio, periodo, valor, consumo]).then((r) => r.id);

const lectura = (db, sub, periodo, valor, extra = {}) => db.query(
  `insert into lecturas(subcontador_id, periodo, lectura, cambio_contador, lectura_inicial_nuevo) values ($1,$2,$3,$4,$5)`,
  [sub, periodo, valor, extra.cambio ?? false, extra.inicialNuevo ?? null]);

const distribucion = async (db, f) => (await db.query(
  `select unidad_id, contrato_id, consumo::float8 as consumo, valor::float8 as valor from calcular_servicio($1)`, [f])).rows;

test('ejemplo de la spec: 600.000 por 1.000 kWh', async () => {
  const db = await nuevaDb();
  const d = await energiaCompartida(db);
  const f = await factura(db, d.servicio, '2026-10', 600000, 1000);
  await lectura(db, d.sApto, '2026-10', 1300);
  await lectura(db, d.sLocal, '2026-10', 1550);
  await lectura(db, d.sEstudio, '2026-10', 1000);
  const filas = await distribucion(db, f);
  const apto = filas.find((r) => r.unidad_id === d.apto);
  const local = filas.find((r) => r.unidad_id === d.local);
  assert.equal(apto.consumo, 300);
  assert.equal(apto.valor, 180000);
  assert.equal(local.valor, 330000);
  await db.query('select cerrar_servicio($1)', [f]);
  const fs = await uno(db, 'select cerrada, diferencia::float8 as diferencia from facturas_servicio where id=$1', [f]);
  assert.equal(fs.cerrada, true);
  assert.equal(fs.diferencia, 90000);
});

test('lectura menor se rechaza y cambio de contador la acepta', async () => {
  const db = await nuevaDb();
  const d = await energiaCompartida(db);
  await assert.rejects(lectura(db, d.sApto, '2026-10', 900), /menor que la anterior/);
  await lectura(db, d.sApto, '2026-10', 120, { cambio: true, inicialNuevo: 0 });
  await lectura(db, d.sLocal, '2026-10', 1000);
  await lectura(db, d.sEstudio, '2026-10', 1000);
  const f = await factura(db, d.servicio, '2026-10', 60000, 100);
  const apto = (await distribucion(db, f)).find((r) => r.unidad_id === d.apto);
  assert.equal(apto.consumo, 120);
});

test('la lectura anterior es la del periodo previo', async () => {
  const db = await nuevaDb();
  const d = await energiaCompartida(db);
  for (const s of [d.sApto, d.sLocal, d.sEstudio]) await lectura(db, s, '2026-09', 1100);
  await lectura(db, d.sApto, '2026-10', 1150);
  await lectura(db, d.sLocal, '2026-10', 1100);
  await lectura(db, d.sEstudio, '2026-10', 1100);
  const f = await factura(db, d.servicio, '2026-10', 50000, 50);
  const apto = (await distribucion(db, f)).find((r) => r.unidad_id === d.apto);
  assert.equal(apto.consumo, 50);
  assert.equal(apto.valor, 50000);
});

test('unidad desocupada suma a la diferencia', async () => {
  const db = await nuevaDb();
  const d = await energiaCompartida(db);
  const f = await factura(db, d.servicio, '2026-10', 600000, 1000);
  await lectura(db, d.sApto, '2026-10', 1300);
  await lectura(db, d.sLocal, '2026-10', 1550);
  await lectura(db, d.sEstudio, '2026-10', 1100);
  const estudio = (await distribucion(db, f)).find((r) => r.unidad_id === d.estudio);
  assert.equal(estudio.contrato_id, null);
  await db.query('select cerrar_servicio($1)', [f]);
  const fs = await uno(db, 'select diferencia::float8 as diferencia from facturas_servicio where id=$1', [f]);
  assert.equal(fs.diferencia, 90000);
  const cobrables = await db.query('select * from distribucion_servicio where factura_id=$1 and contrato_id is not null', [f]);
  assert.equal(cobrables.rows.length, 2);
});

test('no cierra si falta una lectura', async () => {
  const db = await nuevaDb();
  const d = await energiaCompartida(db);
  const f = await factura(db, d.servicio, '2026-10', 600000, 1000);
  await lectura(db, d.sApto, '2026-10', 1300);
  await lectura(db, d.sLocal, '2026-10', 1550);
  await assert.rejects(db.query('select cerrar_servicio($1)', [f]), /Falta la lectura de: SC-301/);
});

test('alerta si los subcontadores superan al principal, pero permite cerrar', async () => {
  const db = await nuevaDb();
  const d = await energiaCompartida(db);
  const f = await factura(db, d.servicio, '2026-10', 100000, 100);
  await lectura(db, d.sApto, '2026-10', 1080);
  await lectura(db, d.sLocal, '2026-10', 1050);
  await lectura(db, d.sEstudio, '2026-10', 1000);
  const alertas = (await db.query('select tipo from alertas_servicio($1)', [f])).rows.map((r) => r.tipo);
  assert.deepEqual(alertas, ['suma_mayor_principal']);
  await db.query('select cerrar_servicio($1)', [f]);
});

test('servicio individual carga el valor completo a su unidad', async () => {
  const db = await nuevaDb();
  const d = await datosBase(db);
  const c = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1 });
  const s = (await uno(db, `insert into servicios(propiedad_id, tipo, empresa, modalidad, unidad_id) values ($1,'agua','EPM','individual',$2) returning id`, [d.propiedad, d.apto])).id;
  const f = await factura(db, s, '2026-10', 85300, null);
  const filas = await distribucion(db, f);
  assert.deepEqual(filas.map((r) => [r.unidad_id, r.contrato_id, r.valor]), [[d.apto, c, 85300]]);
  await db.query('select cerrar_servicio($1)', [f]);
  assert.equal((await uno(db, 'select diferencia::float8 as d from facturas_servicio where id=$1', [f])).d, 0);
});

test('servicio individual exige unidad', async () => {
  const db = await nuevaDb();
  const d = await datosBase(db);
  await assert.rejects(db.query(`insert into servicios(propiedad_id, tipo, modalidad) values ($1,'agua','individual')`, [d.propiedad]));
});

test('una lectura mayor que la del periodo siguiente se rechaza', async () => {
  const db = await nuevaDb();
  const d = await energiaCompartida(db);
  await lectura(db, d.sApto, '2026-10', 1100);
  await lectura(db, d.sApto, '2026-11', 1200);
  await assert.rejects(db.query(`update lecturas set lectura = 1250 where subcontador_id=$1 and periodo='2026-10'`, [d.sApto]), /mayor que la del periodo siguiente/);
});
