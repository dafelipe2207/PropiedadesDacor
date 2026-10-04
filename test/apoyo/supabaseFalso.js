// Cliente que imita el subconjunto de supabase-js que usa la app, ejecutando contra PGlite con RLS.
// Sirve en Node (pruebas de servicios) y en el navegador (verificación de pantallas).
// Solo admite selects planos (sin recursos embebidos): la app obtiene datos unidos desde vistas.

export const PARSERS = {
  20: (v) => Number(v), // int8 → number (como el JSON de Supabase)
  1700: (v) => Number(v), // numeric → number
  1082: (v) => v, // date → 'AAAA-MM-DD'
  1114: (v) => v,
  1184: (v) => v,
};

const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`Identificador no permitido: ${s}`);
  return `"${s}"`;
};

const literal = (v) => (Array.isArray(v) ? `{${v.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(',')}}` : v);

class Consulta {
  constructor(cliente, tabla) {
    this.c = cliente;
    this.tabla = tabla;
    this.op = 'select';
    this.columnas = '*';
    this.filtros = [];
    this.params = [];
    this.orden = [];
    this.limite = null;
    this.unico = null;
    this.devolver = false;
  }

  p(v) { this.params.push(literal(v)); return `$${this.params.length}`; }

  select(cols = '*') {
    if (/[()!:]/.test(cols)) throw new Error('El cliente simulado no admite recursos embebidos: use una vista.');
    this.columnas = cols.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (x === '*' ? '*' : ident(x))).join(', ') || '*';
    if (this.op !== 'select') this.devolver = true;
    return this;
  }
  insert(d) { this.op = 'insert'; this.datos = Array.isArray(d) ? d : [d]; return this; }
  update(d) { this.op = 'update'; this.datos = d; return this; }
  delete() { this.op = 'delete'; return this; }

  filtro(col, opSql, v) { this.filtros.push([col, opSql, v]); return this; }
  eq(c, v) { return this.filtro(c, '=', v); }
  neq(c, v) { return this.filtro(c, '<>', v); }
  gt(c, v) { return this.filtro(c, '>', v); }
  gte(c, v) { return this.filtro(c, '>=', v); }
  lt(c, v) { return this.filtro(c, '<', v); }
  lte(c, v) { return this.filtro(c, '<=', v); }
  in(c, v) { return this.filtro(c, 'in', v); }
  is(c, v) { return this.filtro(c, 'is', v); }
  order(c, { ascending = true } = {}) { this.orden.push(`${ident(c)} ${ascending ? 'asc' : 'desc'}`); return this; }
  limit(n) { this.limite = n; return this; }
  single() { this.unico = 'single'; return this; }
  maybeSingle() { this.unico = 'maybe'; return this; }

  where() {
    if (!this.filtros.length) return '';
    return ' where ' + this.filtros.map(([c, o, v]) => {
      if (o === 'in') return `${ident(c)} = any(${this.p(v)})`;
      if (o === 'is') return `${ident(c)} is ${v === null ? 'null' : v ? 'true' : 'false'}`;
      return `${ident(c)} ${o} ${this.p(v)}`;
    }).join(' and ');
  }

  sql() {
    const t = ident(this.tabla);
    if (this.op === 'select') {
      return `select ${this.columnas} from ${t}${this.where()}`
        + (this.orden.length ? ` order by ${this.orden.join(', ')}` : '')
        + (this.limite ? ` limit ${Number(this.limite)}` : '');
    }
    if (this.op === 'insert') {
      const cols = [...new Set(this.datos.flatMap((d) => Object.keys(d)))];
      const filas = this.datos.map((d) => `(${cols.map((k) => (k in d ? this.p(d[k]) : 'default')).join(', ')})`);
      return `insert into ${t} (${cols.map(ident).join(', ')}) values ${filas.join(', ')} returning *`;
    }
    if (this.op === 'update') {
      const sets = Object.entries(this.datos).map(([k, v]) => `${ident(k)} = ${this.p(v)}`).join(', ');
      return `update ${t} set ${sets}${this.where()} returning *`;
    }
    return `delete from ${t}${this.where()} returning *`;
  }

  async ejecutar() {
    try {
      const filas = await this.c.consultar(this.sql(), this.params);
      if (this.op !== 'select' && !this.devolver) return { data: null, error: null };
      if (this.unico) {
        if (filas.length === 0 && this.unico === 'maybe') return { data: null, error: null };
        if (filas.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'Se esperaba una sola fila' } };
        return { data: filas[0], error: null };
      }
      return { data: filas, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message, code: e.code } };
    }
  }

  then(ok, mal) { return this.ejecutar().then(ok, mal); }
}

export function crearClienteFalso(pg) {
  const usuarios = new Map(); // correo → { id, contrasena }
  const oyentes = [];
  let sesion = null;
  const avisar = (evento) => oyentes.forEach((f) => f(evento, sesion));

  const cliente = {
    async consultar(sql, params) {
      const uid = sesion?.user?.id ?? null;
      return pg.transaction(async (tx) => {
        if (uid) {
          await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
          await tx.exec('set local role authenticated');
        }
        return (await tx.query(sql, params)).rows;
      });
    },

    from(tabla) { return new Consulta(cliente, tabla); },

    async rpc(nombre, args = {}) {
      try {
        const info = (await pg.query(
          `select p.proretset, t.typtype, p.prorettype = 'void'::regtype as es_void
           from pg_proc p join pg_type t on t.oid = p.prorettype
           where p.proname = $1 and p.pronamespace = 'public'::regnamespace`, [nombre])).rows[0];
        if (!info) return { data: null, error: { message: `Función no encontrada: ${nombre}` } };
        const claves = Object.keys(args);
        const sql = `select * from ${ident(nombre)}(${claves.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`;
        const filas = await cliente.consultar(sql, claves.map((k) => literal(args[k])));
        if (info.es_void) return { data: null, error: null };
        if (info.proretset) return { data: filas, error: null };
        if (info.typtype === 'c') return { data: filas[0] ?? null, error: null };
        return { data: filas[0]?.[nombre] ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: e.message, code: e.code } };
      }
    },

    auth: {
      async getSession() { return { data: { session: sesion } }; },
      async signInWithPassword({ email, password }) {
        const u = usuarios.get(email);
        if (!u || u.contrasena !== password) return { data: null, error: { message: 'Invalid login credentials' } };
        sesion = { user: { id: u.id, email } };
        avisar('SIGNED_IN');
        return { data: { session: sesion, user: sesion.user }, error: null };
      },
      async signOut() { sesion = null; avisar('SIGNED_OUT'); return { error: null }; },
      onAuthStateChange(f) {
        oyentes.push(f);
        return { data: { subscription: { unsubscribe: () => oyentes.splice(oyentes.indexOf(f), 1) } } };
      },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      async updateUser() { return { data: { user: sesion?.user }, error: null }; },
    },

    storage: {
      from: () => ({
        async upload(ruta) { return { data: { path: ruta }, error: null }; },
        async createSignedUrl(ruta) { return { data: { signedUrl: `about:blank#${ruta}` }, error: null }; },
      }),
    },

    functions: {
      async invoke(nombre, { body }) {
        if (nombre !== 'crear-usuario') return { data: null, error: { message: 'Función no disponible' } };
        const [{ es_admin: esAdmin }] = await cliente.consultar('select public.es_admin() as es_admin', []);
        if (!esAdmin) return { data: null, error: { message: 'Solo el administrador puede crear usuarios' } };
        if (usuarios.has(body.correo)) return { data: null, error: { message: 'Ya existe un usuario con ese correo' } };
        const id = await cliente.registrarUsuario(body.correo, 'temporal123', body);
        return { data: { id }, error: null };
      },
    },

    // Solo para pruebas: crea un usuario con perfil (como superusuario).
    async registrarUsuario(correo, contrasena, { rol, propietario_id = null, inquilino_id = null }) {
      const id = crypto.randomUUID();
      await pg.query('insert into auth.users(id) values ($1)', [id]);
      await pg.query('insert into perfiles(id, rol, propietario_id, inquilino_id) values ($1,$2,$3,$4)',
        [id, rol, propietario_id, inquilino_id]);
      usuarios.set(correo, { id, contrasena });
      return id;
    },
  };
  return cliente;
}
