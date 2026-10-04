import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..', '..');
const carpetaMigraciones = join(raiz, 'supabase', 'migrations');

export async function nuevaDb() {
  const db = new PGlite();
  await db.exec(readFileSync(join(aqui, 'auth_simulado.sql'), 'utf8'));
  const archivos = readdirSync(carpetaMigraciones).filter((f) => f.endsWith('.sql')).sort();
  for (const archivo of archivos) {
    try {
      await db.exec(readFileSync(join(carpetaMigraciones, archivo), 'utf8'));
    } catch (e) {
      throw new Error(`Migración ${archivo}: ${e.message}`);
    }
  }
  return db;
}

// Ejecuta fn como usuario autenticado (RLS activo) y restaura el rol de superusuario.
export async function comoUsuario(db, uid, fn) {
  await db.exec(`set request.jwt.claim.sub = '${uid}'; set role authenticated;`);
  try {
    return await fn(db);
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
}

export async function crearUsuario(db, { rol, propietario_id = null, inquilino_id = null }) {
  const uid = randomUUID();
  await db.query('insert into auth.users(id) values ($1)', [uid]);
  await db.query(
    'insert into public.perfiles(id, rol, propietario_id, inquilino_id) values ($1,$2,$3,$4)',
    [uid, rol, propietario_id, inquilino_id],
  );
  return uid;
}

// Devuelve la primera fila de una consulta.
export async function uno(db, sql, params = []) {
  const r = await db.query(sql, params);
  return r.rows[0];
}

// Datos de apoyo reutilizados por varias pruebas.
export async function datosBase(db) {
  const prop = await uno(db, `insert into propietarios(nombre, documento, telefono) values ('Propietario Uno','900','3001112233') returning id`);
  const propiedad = await uno(db, `insert into propiedades(nombre, direccion, ciudad, propietario_id) values ('Edificio Prueba','Cra 1 # 2-3','Medellín',$1) returning id`, [prop.id]);
  const apto = await uno(db, `insert into unidades(propiedad_id, tipo, identificador, canon) values ($1,'apartamento','Apto 201',1200000) returning id`, [propiedad.id]);
  const estudio = await uno(db, `insert into unidades(propiedad_id, tipo, identificador, canon) values ($1,'apartaestudio','Estudio 301',800000) returning id`, [propiedad.id]);
  const local = await uno(db, `insert into unidades(propiedad_id, tipo, identificador, canon) values ($1,'local','Local 1',2000000) returning id`, [propiedad.id]);
  const inq1 = await uno(db, `insert into inquilinos(nombre, documento, telefono) values ('Inquilino Uno','111','3000000001') returning id`);
  const inq2 = await uno(db, `insert into inquilinos(nombre, documento, telefono) values ('Inquilino Dos','222','3000000002') returning id`);
  return { propietario: prop.id, propiedad: propiedad.id, apto: apto.id, estudio: estudio.id, local: local.id, inq1: inq1.id, inq2: inq2.id };
}

export async function crearContrato(db, { unidad, inquilino, inicio = '2026-01-01', fin = null, canon = null, dia_pago = 5 }) {
  const c = await uno(db,
    `insert into contratos(unidad_id, inquilino_id, fecha_inicio, fecha_fin, canon, dia_pago) values ($1,$2,$3,$4,$5,$6) returning id`,
    [unidad, inquilino, inicio, fin, canon, dia_pago]);
  return c.id;
}
