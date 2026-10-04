import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { nuevaDb, datosBase, crearContrato, crearUsuario, comoUsuario, uno } from './apoyo/db.js';

async function preparar() {
  const db = await nuevaDb();
  const d = await datosBase(db);
  d.c1 = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1, inicio: '2026-10-01' });
  d.c2 = await crearContrato(db, { unidad: d.local, inquilino: d.inq2, inicio: '2026-10-01' });
  d.admin = await crearUsuario(db, { rol: 'admin' });
  d.u1 = await crearUsuario(db, { rol: 'inquilino', inquilino_id: d.inq1 });
  d.u2 = await crearUsuario(db, { rol: 'inquilino', inquilino_id: d.inq2 });
  d.dueno = await crearUsuario(db, { rol: 'propietario', propietario_id: d.propietario });
  await db.query(`select generar_cobros('2026-10')`);
  return { db, d };
}

const filas = (db, uid, sql, params = []) => comoUsuario(db, uid, async (x) => (await x.query(sql, params)).rows);

test('inquilino solo ve su cobro', async () => {
  const { db, d } = await preparar();
  const v1 = await filas(db, d.u1, 'select contrato_id from cobros');
  const v2 = await filas(db, d.u2, 'select contrato_id from cobros');
  assert.deepEqual(v1.map((r) => r.contrato_id), [d.c1]);
  assert.deepEqual(v2.map((r) => r.contrato_id), [d.c2]);
  assert.equal((await filas(db, d.u1, 'select id from inquilinos')).length, 1);
  assert.equal((await filas(db, d.u1, 'select id from propietarios')).length, 0);
});

test('inquilino que cambió de unidad ve sus dos contratos y no los cobros del nuevo inquilino de su unidad anterior', async () => {
  const { db, d } = await preparar();
  await db.query(`update contratos set estado='terminado', fecha_fin='2026-10-31' where id=$1`, [d.c1]);
  const nuevoEnApto = await crearContrato(db, { unidad: d.apto, inquilino: d.inq2, inicio: '2026-11-01' });
  const c1b = await crearContrato(db, { unidad: d.estudio, inquilino: d.inq1, inicio: '2026-11-01' });
  await db.query(`select generar_cobros('2026-11')`);
  const contratos = (await filas(db, d.u1, 'select id from contratos order by fecha_inicio')).map((r) => r.id);
  assert.deepEqual(contratos, [d.c1, c1b]);
  const cobros = (await filas(db, d.u1, 'select contrato_id from cobros')).map((r) => r.contrato_id);
  assert.ok(!cobros.includes(nuevoEnApto));
  assert.equal(cobros.length, 2);
});

test('inquilino solo ve las facturas de servicio que le cobraron', async () => {
  const { db, d } = await preparar();
  const s1 = (await uno(db, `insert into servicios(propiedad_id, tipo, modalidad, unidad_id) values ($1,'agua','individual',$2) returning id`, [d.propiedad, d.apto])).id;
  const s2 = (await uno(db, `insert into servicios(propiedad_id, tipo, modalidad, unidad_id) values ($1,'agua','individual',$2) returning id`, [d.propiedad, d.local])).id;
  for (const s of [s1, s2]) {
    const f = (await uno(db, `insert into facturas_servicio(servicio_id, periodo, valor) values ($1,'2026-10',50000) returning id`, [s])).id;
    await db.query('select cerrar_servicio($1)', [f]);
  }
  await db.query(`select generar_cobros('2026-10')`);
  assert.equal((await filas(db, d.u1, 'select id from facturas_servicio')).length, 1);
  assert.equal((await filas(db, d.u1, 'select id from distribucion_servicio')).length, 1);
  assert.equal((await filas(db, d.dueno, 'select id from facturas_servicio')).length, 2);
});

test('propietario no ve propiedades ajenas', async () => {
  const { db, d } = await preparar();
  const otro = await uno(db, `insert into propietarios(nombre) values ('Otro') returning id`);
  await db.query(`insert into propiedades(nombre, propietario_id) values ('Ajena',$1)`, [otro.id]);
  const props = await filas(db, d.dueno, 'select nombre from propiedades');
  assert.deepEqual(props.map((r) => r.nombre), ['Edificio Prueba']);
  assert.equal((await filas(db, d.dueno, 'select id from cobros')).length, 2);
  assert.equal((await filas(db, d.dueno, 'select id from inquilinos')).length, 2);
});

test('inquilino y propietario no pueden escribir', async () => {
  const { db, d } = await preparar();
  await assert.rejects(comoUsuario(db, d.u1, (x) => x.query(
    `insert into pagos(numero, contrato_id, fecha, valor, recibido_por, clave) values (99,$1,'2026-10-01',1,$2,$3)`, [d.c1, d.u1, randomUUID()])));
  await assert.rejects(comoUsuario(db, d.dueno, (x) => x.query(`insert into propiedades(nombre, propietario_id) values ('X',$1)`, [d.propietario])));
  const r = await comoUsuario(db, d.u1, (x) => x.query('update cobros set saldo = 0'));
  assert.equal(r.affectedRows, 0);
});

test('nadie puede borrar ni editar pagos directamente', async () => {
  const { db, d } = await preparar();
  await comoUsuario(db, d.admin, (x) => x.query('select registrar_pago($1,$2,$3,$4)', [d.c1, 100000, '2026-10-05', randomUUID()]));
  await assert.rejects(comoUsuario(db, d.admin, (x) => x.query('delete from pagos')));
  await assert.rejects(comoUsuario(db, d.admin, (x) => x.query('update pagos set valor = 1')));
  assert.equal(Number((await uno(db, 'select count(*) as n from pagos')).n), 1);
});

test('el administrador ve todo y gestiona el catálogo', async () => {
  const { db, d } = await preparar();
  assert.equal((await filas(db, d.admin, 'select id from cobros')).length, 2);
  await comoUsuario(db, d.admin, (x) => x.query(`insert into propietarios(nombre) values ('Nuevo')`));
  await comoUsuario(db, d.admin, (x) => x.query(`select generar_cobros('2026-11')`));
  assert.equal((await filas(db, d.admin, 'select id from cobros')).length, 4);
});
