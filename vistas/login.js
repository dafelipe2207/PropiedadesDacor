import { iniciarSesion, enviarRecuperacion, cambiarContrasena } from '../lib/auth.js';
import { esc } from '../lib/formato.js';
import { alEnviar, aviso } from '../lib/ui.js';
import { NOMBRE_APP } from '../config.js';

export function renderIngreso(el, alEntrar) {
  el.innerHTML = `
    <div class="ingreso">
      <h1>${esc(NOMBRE_APP)}</h1>
      <div class="tarjeta">
        <form id="f-ingreso">
          <label>Correo<input name="correo" type="email" autocomplete="username" required></label>
          <label>Contraseña<input name="contrasena" type="password" autocomplete="current-password" required></label>
          <button type="submit">Ingresar</button>
        </form>
        <p><a href="#" id="olvido">¿Olvidó su contraseña?</a></p>
      </div>
    </div>`;
  alEnviar(el.querySelector('#f-ingreso'), async ({ correo, contrasena }) => {
    await iniciarSesion(correo, contrasena);
    alEntrar();
  });
  el.querySelector('#olvido').onclick = (ev) => {
    ev.preventDefault();
    renderRecuperar(el, alEntrar);
  };
}

function renderRecuperar(el, alEntrar) {
  el.innerHTML = `
    <div class="ingreso">
      <h1>Recuperar contraseña</h1>
      <div class="tarjeta">
        <form id="f-recuperar">
          <label>Correo<input name="correo" type="email" required></label>
          <button type="submit">Enviar enlace</button>
        </form>
        <p><a href="#" id="volver">Volver</a></p>
      </div>
    </div>`;
  alEnviar(el.querySelector('#f-recuperar'), async ({ correo }) => {
    await enviarRecuperacion(correo);
    aviso('Si el correo está registrado, le llegará un enlace para cambiar la contraseña.');
  });
  el.querySelector('#volver').onclick = (ev) => { ev.preventDefault(); renderIngreso(el, alEntrar); };
}

export function renderNuevaContrasena(el, alTerminar) {
  el.innerHTML = `
    <div class="ingreso">
      <h1>Nueva contraseña</h1>
      <div class="tarjeta">
        <form id="f-nueva">
          <label>Nueva contraseña<input name="nueva" type="password" minlength="8" autocomplete="new-password" required>
            <span class="ayuda">Mínimo 8 caracteres.</span></label>
          <button type="submit">Guardar</button>
        </form>
      </div>
    </div>`;
  alEnviar(el.querySelector('#f-nueva'), async ({ nueva }) => {
    await cambiarContrasena(nueva);
    aviso('Contraseña actualizada.');
    history.replaceState(null, '', location.pathname);
    alTerminar();
  });
}
