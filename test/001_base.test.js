import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaDb, datosBase, crearContrato, uno } from './apoyo/db.js';

test('una unidad solo admite un contrato activo', async () => {
  const db = await nuevaDb();
  const d = await datosBase(db);
  await crearContrato(db, { unidad: d.apto, inquilino: d.inq1 });
  await assert.rejects(crearContrato(db, { unidad: d.apto, inquilino: d.inq2 }));
});

test('el contrato copia el canon de la unidad', async () => {
  const db = await nuevaDb();
  const d = await datosBase(db);
  const c = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1 });
  assert.equal(Number((await uno(db, 'select canon from contratos where id=$1', [c])).canon), 1200000);
  await db.query('update unidades set canon=1300000 where id=$1', [d.apto]);
  assert.equal(Number((await uno(db, 'select canon from contratos where id=$1', [c])).canon), 1200000);
});

test('tipo de unidad inválido se rechaza', async () => {
  const db = await nuevaDb();
  const d = await datosBase(db);
  await assert.rejects(db.query(`insert into unidades(propiedad_id, tipo, identificador, canon) values ($1,'bodega','B1',100)`, [d.propiedad]));
});

test('crear contrato marca la unidad ocupada y terminarlo la libera', async () => {
  const db = await nuevaDb();
  const d = await datosBase(db);
  const c = await crearContrato(db, { unidad: d.apto, inquilino: d.inq1 });
  assert.equal((await uno(db, 'select estado from unidades where id=$1', [d.apto])).estado, 'ocupada');
  await db.query(`update contratos set estado='terminado', fecha_fin='2026-06-30' where id=$1`, [c]);
  assert.equal((await uno(db, 'select estado from unidades where id=$1', [d.apto])).estado, 'disponible');
});
