import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, entrarComo } from './apoyo/app.js';
import * as P from '../services/propiedades.js';
import * as Pe from '../services/personas.js';
import * as C from '../services/contratos.js';

async function edificio() {
  const dueno = await Pe.crearPersona('propietarios', { nombre: 'Carlos Dueño', telefono: '300 111 2233' });
  const prop = await P.crearPropiedad({ nombre: 'Edificio Prueba', ciudad: 'Medellín', propietario_id: dueno.id });
  const apto = await P.crearUnidad({ propiedad_id: prop.id, tipo: 'apartamento', identificador: 'Apto 201', canon: 1200000 });
  const est = await P.crearUnidad({ propiedad_id: prop.id, tipo: 'apartaestudio', identificador: 'Estudio 301', canon: 800000 });
  const loc = await P.crearUnidad({ propiedad_id: prop.id, tipo: 'local', identificador: 'Local 1', canon: 2000000 });
  return { dueno, prop, apto, est, loc };
}

test('propiedad con tres tipos de unidad y cánones distintos', async () => {
  await prepararApp();
  const { prop } = await edificio();
  const unidades = await P.listarUnidades(prop.id);
  assert.deepEqual(unidades.map((u) => [u.identificador, u.tipo, u.canon, u.estado]), [
    ['Apto 201', 'apartamento', 1200000, 'disponible'],
    ['Estudio 301', 'apartaestudio', 800000, 'disponible'],
    ['Local 1', 'local', 2000000, 'disponible'],
  ]);
});

test('contrato ocupa la unidad y al terminar la libera', async () => {
  await prepararApp();
  const { apto } = await edificio();
  const inq = await Pe.crearPersona('inquilinos', { nombre: 'Ana Inquilina', telefono: '3001234567' });
  const c = await C.crearContrato({ unidad_id: apto.id, inquilino_id: inq.id, fecha_inicio: '2026-10-01', dia_pago: 5 });
  assert.equal(c.canon, 1200000);
  const [u] = (await P.listarUnidades()).filter((x) => x.id === apto.id);
  assert.equal(u.estado, 'ocupada');
  assert.equal(u.inquilino, 'Ana Inquilina');
  const lista = await C.listarContratos({ estado: 'activo' });
  assert.equal(lista[0].unidad, 'Apto 201');
  await C.terminarContrato(c.id, '2026-12-31');
  assert.equal((await P.listarUnidades()).find((x) => x.id === apto.id).estado, 'disponible');
});

test('validaciones en español', async () => {
  await prepararApp();
  const { prop } = await edificio();
  assert.throws(() => P.crearUnidad({ propiedad_id: prop.id, tipo: 'bodega', identificador: 'B', canon: 1 }), /tipo de unidad/);
  assert.throws(() => Pe.crearPersona('inquilinos', { nombre: 'X', telefono: '604 444 5555' }), /10 dígitos/);
  await assert.rejects(P.crearUnidad({ propiedad_id: prop.id, tipo: 'local', identificador: 'Local 1', canon: 1 }), /Ya existe/);
});

test('crear acceso para inquilino y que solo vea lo suyo', async () => {
  const { cliente } = await prepararApp();
  const { apto } = await edificio();
  const inq = await Pe.crearPersona('inquilinos', { nombre: 'Ana', correo: 'ana@prueba.co' });
  await C.crearContrato({ unidad_id: apto.id, inquilino_id: inq.id, fecha_inicio: '2026-10-01' });
  await Pe.crearAcceso({ correo: 'ana@prueba.co', rol: 'inquilino', inquilino_id: inq.id });
  await entrarComo(cliente, 'ana@prueba.co', 'temporal123');
  assert.equal((await C.listarContratos()).length, 1);
  assert.equal((await P.listarUnidades()).length, 1);
  await assert.rejects(P.crearPropiedad({ nombre: 'X', propietario_id: inq.id }), /permiso/);
});
