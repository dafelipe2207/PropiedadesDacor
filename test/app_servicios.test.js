import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp } from './apoyo/app.js';
import * as P from '../services/propiedades.js';
import * as Pe from '../services/personas.js';
import * as C from '../services/contratos.js';
import * as S from '../services/servicios.js';

async function escenario() {
  await prepararApp();
  const dueno = await Pe.crearPersona('propietarios', { nombre: 'Dueño' });
  const prop = await P.crearPropiedad({ nombre: 'Edificio', propietario_id: dueno.id });
  const apto = await P.crearUnidad({ propiedad_id: prop.id, tipo: 'apartamento', identificador: 'Apto 201', canon: 1200000 });
  const est = await P.crearUnidad({ propiedad_id: prop.id, tipo: 'apartaestudio', identificador: 'Estudio 301', canon: 800000 });
  const loc = await P.crearUnidad({ propiedad_id: prop.id, tipo: 'local', identificador: 'Local 1', canon: 2000000 });
  const i1 = await Pe.crearPersona('inquilinos', { nombre: 'Ana' });
  const i2 = await Pe.crearPersona('inquilinos', { nombre: 'Beto' });
  await C.crearContrato({ unidad_id: apto.id, inquilino_id: i1.id, fecha_inicio: '2026-09-01' });
  await C.crearContrato({ unidad_id: loc.id, inquilino_id: i2.id, fecha_inicio: '2026-09-01' });
  const energia = await S.crearServicio({ propiedad_id: prop.id, tipo: 'energia', empresa: 'EPM', modalidad: 'compartido', medida: 'kWh' });
  for (const [u, id] of [[apto, 'SC-201'], [est, 'SC-301'], [loc, 'SC-L1']]) {
    await S.crearSubcontador({ servicio_id: energia.id, unidad_id: u.id, identificador: id, lectura_inicial: 1000 });
  }
  return { prop, apto, est, loc, energia };
}

test('flujo de servicio compartido con el ejemplo de la spec', async () => {
  const e = await escenario();
  const f = await S.guardarFactura({ servicio_id: e.energia.id, periodo: '2026-10', valor: 600000, consumo_principal: 1000, vencimiento: '2026-10-20' });
  let lecturas = await S.lecturasDelPeriodo(e.energia.id, '2026-10');
  assert.deepEqual(lecturas.map((l) => [l.identificador, l.anterior, l.lectura]), [['SC-201', 1000, null], ['SC-301', 1000, null], ['SC-L1', 1000, null]]);
  const valores = { 'SC-201': 1300, 'SC-301': 1000, 'SC-L1': 1550 };
  for (const l of lecturas) await S.guardarLectura({ subcontador_id: l.subcontador_id, periodo: '2026-10', lectura: valores[l.identificador] });
  // corregir una lectura antes de cerrar actualiza en vez de duplicar
  await S.guardarLectura({ subcontador_id: lecturas[0].subcontador_id, periodo: '2026-10', lectura: 1300 });
  lecturas = await S.lecturasDelPeriodo(e.energia.id, '2026-10');
  assert.deepEqual(lecturas.map((l) => l.consumo), [300, 0, 550]);

  const previa = await S.vistaPrevia(f.id);
  assert.deepEqual(previa.filas.map((r) => [r.unidad, r.valor, r.cobrable]), [['Apto 201', 180000, true], ['Estudio 301', 0, false], ['Local 1', 330000, true]]);
  assert.equal(previa.diferencia, 90000);
  assert.deepEqual(previa.alertas, []);
  await S.cerrarServicio(f.id);
  assert.equal((await S.listarFacturas('2026-10'))[0].cerrada, true);
});

test('guardar factura dos veces actualiza la misma', async () => {
  const e = await escenario();
  const a = await S.guardarFactura({ servicio_id: e.energia.id, periodo: '2026-10', valor: 500000, consumo_principal: 900 });
  const b = await S.guardarFactura({ servicio_id: e.energia.id, periodo: '2026-10', valor: 600000, consumo_principal: 1000 });
  assert.equal(a.id, b.id);
  assert.equal((await S.listarFacturas('2026-10'))[0].valor, 600000);
});

test('servicio individual y alertas', async () => {
  const e = await escenario();
  const agua = await S.crearServicio({ propiedad_id: e.prop.id, tipo: 'agua', empresa: 'EPM', modalidad: 'individual', unidad_id: e.apto.id });
  const f = await S.guardarFactura({ servicio_id: agua.id, periodo: '2026-10', valor: 85300 });
  const previa = await S.vistaPrevia(f.id);
  assert.deepEqual(previa.filas.map((r) => [r.unidad, r.valor]), [['Apto 201', 85300]]);
  assert.throws(() => S.crearServicio({ propiedad_id: e.prop.id, tipo: 'agua', modalidad: 'individual' }), /unidad/);
  const fe = await S.guardarFactura({ servicio_id: e.energia.id, periodo: '2026-10', valor: 600000, consumo_principal: 1000 });
  const p2 = await S.vistaPrevia(fe.id);
  assert.match(p2.alertas[0].mensaje, /Falta la lectura de: SC-201, SC-301, SC-L1/);
  await assert.rejects(S.cerrarServicio(fe.id), /Falta la lectura/);
});

test('lectura menor muestra el error en español', async () => {
  const e = await escenario();
  const [l] = await S.lecturasDelPeriodo(e.energia.id, '2026-10');
  await assert.rejects(S.guardarLectura({ subcontador_id: l.subcontador_id, periodo: '2026-10', lectura: 500 }), /menor que la anterior/);
  await S.guardarLectura({ subcontador_id: l.subcontador_id, periodo: '2026-10', lectura: 40, cambio_contador: true, lectura_inicial_nuevo: 0 });
  const [l2] = await S.lecturasDelPeriodo(e.energia.id, '2026-10');
  assert.equal(l2.consumo, 40);
});
