// Enrutador principal: sesión → perfil → menú y vista según el rol.
import { configurado, tipoEnlace } from './lib/supabaseClient.js';
import { db } from './lib/cliente.js';
import { sesionActual, miPerfil, cerrarSesion } from './lib/auth.js';
import { esc } from './lib/formato.js';
import { error } from './lib/ui.js';
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

function pintarMarco() {
  const rutas = RUTAS[contexto.perfil.rol];
  app.innerHTML = `
    <header class="barra no-imprimir">
      <div class="barra-fila">
        <span class="barra-titulo">${esc(NOMBRE_APP)}</span>
        <button type="button" class="boton-icono barra-usuario" id="salir">Salir</button>
      </div>
      ${rutas.length > 1 ? `<nav class="menu">${rutas.map(([r, t]) => `<a href="#/${r}" data-ruta="${r}">${esc(t)}</a>`).join('')}</nav>` : ''}
    </header>
    <main id="vista"></main>`;
  app.querySelector('#salir').onclick = cerrarSesion;
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
    app.querySelectorAll('.menu a').forEach((a) => a.classList.toggle('activo', a.dataset.ruta === encontrada[0]));
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
