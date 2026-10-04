// Enrutador principal: sesión → perfil → menú y vista según el rol.
import { configurado, tipoEnlace } from './lib/supabaseClient.js';
import { db } from './lib/cliente.js';
import { sesionActual, miPerfil, cerrarSesion } from './lib/auth.js';
import { esc } from './lib/formato.js';
import { error, modal } from './lib/ui.js';
import { NOMBRE_APP } from './config.js';
import { renderIngreso, renderNuevaContrasena } from './vistas/login.js';

const RUTAS = {
  admin: [
    ['inicio', 'Inicio', './vistas/admin/inicio.js'],
    ['propiedades', 'Propiedades', './vistas/admin/propiedades.js'],
    ['personas', 'Personas', './vistas/admin/personas.js'],
    ['contratos', 'Contratos', './vistas/admin/contratos.js'],
    ['servicios', 'Servicios', './vistas/admin/servicios.js'],
    ['cobros', 'Cobros', './vistas/admin/cobros.js'],
    ['pagos', 'Pagos', './vistas/admin/pagos.js'],
    ['caja', 'Caja', './vistas/admin/caja.js'],
    ['reportes', 'Reportes', './vistas/admin/reportes.js'],
  ],
  inquilino: [['cuenta', 'Mi cuenta', './vistas/inquilino.js']],
  propietario: [['resumen', 'Resumen', './vistas/propietario.js']],
};
const RUTA_RECIBO = './vistas/recibo.js';

const app = document.getElementById('app');
let contexto = null;
let escuchando = false;
// Enlace de correo pendiente: 'invite' o 'recovery' piden crear contraseña antes de entrar.
let enlacePendiente = tipoEnlace;

async function iniciar() {
  if (!configurado) {
    app.innerHTML = `<div class="ingreso"><h1>${esc(NOMBRE_APP)}</h1>
      <p class="caja-error">No se pudo conectar: la aplicación aún no tiene configurada la base de datos.</p></div>`;
    return;
  }
  if (!escuchando) {
    escuchando = true;
    db().auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY' && enlacePendiente !== 'recovery') { enlacePendiente = 'recovery'; iniciar(); }
      if (evento === 'SIGNED_OUT') { contexto = null; iniciar(); }
    });
  }
  const sesion = await sesionActual();
  if (enlacePendiente === 'vencido') {
    enlacePendiente = null;
    history.replaceState(null, '', location.pathname);
    renderIngreso(app, iniciar);
    error(new Error('El enlace del correo venció o ya fue usado. Pida uno nuevo con «¿Olvidó su contraseña?».'));
    return;
  }
  if (sesion && (enlacePendiente === 'invite' || enlacePendiente === 'recovery')) {
    renderNuevaContrasena(app, () => {
      enlacePendiente = null;
      history.replaceState(null, '', location.pathname);
      iniciar();
    }, enlacePendiente);
    return;
  }
  if (!sesion) { renderIngreso(app, iniciar); return; }
  try {
    const perfil = await miPerfil(sesion.user.id);
    contexto = { sesion, perfil, navegar: (ruta) => { location.hash = '#/' + ruta; } };
    pintarMarco();
    await mostrarRuta();
  } catch (e) {
    app.innerHTML = `<div class="ingreso"><p class="caja-error">${esc(e.message)}</p>
      <button type="button" id="salir">Cerrar sesión</button></div>`;
    app.querySelector('#salir').onclick = cerrarSesion;
  }
}

// Íconos simples (trazo) para la barra inferior del celular.
const ICONOS = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  cobros: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  pagos: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  servicios: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  mas: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
};
const icono = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONOS[n]}</svg>`;
// En el celular, el administrador ve estas 4 abajo; el resto va en "Más".
const PRINCIPALES = ['inicio', 'cobros', 'pagos', 'servicios'];

function pintarMarco() {
  const rutas = RUTAS[contexto.perfil.rol];
  const varias = rutas.length > 1;
  const principales = rutas.filter(([r]) => PRINCIPALES.includes(r));
  const resto = rutas.filter(([r]) => !PRINCIPALES.includes(r));
  app.innerHTML = `
    <header class="barra no-imprimir">
      <div class="barra-fila">
        <span class="barra-titulo">${esc(NOMBRE_APP)}</span>
        <button type="button" class="boton-icono barra-usuario" data-salir>Salir</button>
      </div>
      ${varias ? `<nav class="menu menu-escritorio">${rutas.map(([r, t]) => `<a href="#/${r}" data-ruta="${r}">${esc(t)}</a>`).join('')}</nav>` : ''}
    </header>
    <main id="vista" class="${varias ? 'con-barra-inferior' : ''}"></main>
    ${varias ? `
    <nav class="barra-inferior no-imprimir" aria-label="Menú">
      ${principales.map(([r, t]) => `<a href="#/${r}" data-ruta="${r}">${icono(r)}<span>${esc(t)}</span></a>`).join('')}
      <button type="button" data-mas data-ruta-grupo="${resto.map(([r]) => r).join(' ')}">${icono('mas')}<span>Más</span></button>
    </nav>` : ''}`;
  app.querySelectorAll('[data-salir]').forEach((b) => { b.onclick = cerrarSesion; });
  const mas = app.querySelector('[data-mas]');
  if (mas) mas.onclick = () => {
    const hoja = modal('Más opciones', `
      <ul class="lista lista-menu">${resto.map(([r, t]) => `<li><a href="#/${r}" data-cerrar>${esc(t)}<span aria-hidden="true">›</span></a></li>`).join('')}
        <li><a href="#" data-salir-hoja>Cerrar sesión</a></li></ul>`);
    hoja.el.querySelector('[data-salir-hoja]').onclick = (ev) => { ev.preventDefault(); hoja.cerrar(); cerrarSesion(); };
  };
}

async function mostrarRuta() {
  if (!contexto) return;
  const rutas = RUTAS[contexto.perfil.rol];
  const [ruta, ...params] = location.hash.replace(/^#\/?/, '').split('/');
  const vista = document.getElementById('vista');
  let modulo;
  if (ruta === 'recibo') {
    modulo = RUTA_RECIBO;
  } else {
    const encontrada = rutas.find(([r]) => r === ruta) ?? rutas[0];
    modulo = encontrada[2];
    app.querySelectorAll('[data-ruta]').forEach((a) => a.classList.toggle('activo', a.dataset.ruta === encontrada[0]));
    app.querySelector('[data-mas]')?.classList.toggle('activo', app.querySelector('[data-mas]').dataset.rutaGrupo.split(' ').includes(encontrada[0]));
    window.scrollTo(0, 0);
  }
  vista.innerHTML = '<p class="cargando">Cargando…</p>';
  try {
    const { render } = await import(modulo);
    await render(vista, { ...contexto, params });
  } catch (e) {
    vista.innerHTML = `<p class="caja-error">${esc(e.message)}</p>`;
    error(e);
  }
}

window.addEventListener('hashchange', mostrarRuta);
iniciar();
