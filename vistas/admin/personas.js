import * as Pe from '../../services/personas.js';
import { esc } from '../../lib/formato.js';
import { modal, alEnviar, aviso, vacio, conCarga, error } from '../../lib/ui.js';

const TIPOS = {
  inquilinos: { titulo: 'Inquilinos', uno: 'inquilino', rol: 'inquilino', campo: 'inquilino_id' },
  propietarios: { titulo: 'Propietarios', uno: 'propietario', rol: 'propietario', campo: 'propietario_id' },
};

export async function render(el) {
  const [inquilinos, propietarios, accesos] = await Promise.all([Pe.listarInquilinos(), Pe.listarPropietarios(), Pe.listarAccesos()]);
  const datos = { inquilinos, propietarios };
  const tieneAcceso = (tipo, id) => accesos.some((a) => a[TIPOS[tipo].campo] === id);
  const recargar = () => render(el);

  el.innerHTML = Object.entries(TIPOS).map(([tipo, t]) => `
    <section class="tarjeta">
      <div class="tarjeta-cabecera"><h2>${t.titulo}</h2>
        <button type="button" class="boton-chico" data-nuevo="${tipo}">+ ${t.uno[0].toUpperCase() + t.uno.slice(1)}</button></div>
      ${datos[tipo].length ? `<ul class="lista">${datos[tipo].map((p) => `
        <li>
          <div data-editar="${tipo}:${p.id}" style="cursor:pointer">
            <div class="principal">${esc(p.nombre)}</div>
            <div class="secundario">${esc([p.documento && 'CC ' + p.documento, p.telefono, p.correo].filter(Boolean).join(' · '))}</div>
          </div>
          ${tieneAcceso(tipo, p.id)
            ? '<span class="etiqueta">Con acceso</span>'
            : `<button type="button" class="boton-secundario boton-chico" data-acceso="${tipo}:${p.id}">Dar acceso</button>`}
        </li>`).join('')}</ul>` : vacio(`Aún no hay ${t.titulo.toLowerCase()}.`)}
    </section>`).join('');

  const form = (p = {}) => `
    <form>
      <label>Nombre completo<input name="nombre" value="${esc(p.nombre ?? '')}" required></label>
      <label>Cédula o NIT<input name="documento" value="${esc(p.documento ?? '')}" inputmode="numeric"></label>
      <label>Celular (WhatsApp)<input name="telefono" value="${esc(p.telefono ?? '')}" inputmode="tel" placeholder="300 123 4567"></label>
      <label>Correo<input name="correo" type="email" value="${esc(p.correo ?? '')}">
        <span class="ayuda">Necesario para darle acceso a la aplicación.</span></label>
      <button type="submit">Guardar</button>
    </form>`;

  el.querySelectorAll('[data-nuevo]').forEach((b) => b.onclick = () => {
    const tipo = b.dataset.nuevo;
    const m = modal(`Nuevo ${TIPOS[tipo].uno}`, form());
    alEnviar(m.el.querySelector('form'), async (d) => { await Pe.crearPersona(tipo, d); m.cerrar(); aviso('Guardado.'); recargar(); });
  });
  el.querySelectorAll('[data-editar]').forEach((b) => b.onclick = () => {
    const [tipo, id] = b.dataset.editar.split(':');
    const p = datos[tipo].find((x) => x.id === id);
    const m = modal(`Editar ${TIPOS[tipo].uno}`, form(p));
    alEnviar(m.el.querySelector('form'), async (d) => { await Pe.actualizarPersona(tipo, id, d); m.cerrar(); aviso('Guardado.'); recargar(); });
  });
  el.querySelectorAll('[data-acceso]').forEach((b) => b.onclick = async () => {
    const [tipo, id] = b.dataset.acceso.split(':');
    const p = datos[tipo].find((x) => x.id === id);
    if (!p.correo) { error(new Error('Primero agregue el correo de esta persona.')); return; }
    if (!window.confirm(`Se enviará una invitación a ${p.correo} para crear su contraseña. ¿Continuar?`)) return;
    try {
      await conCarga(b, () => Pe.crearAcceso({ correo: p.correo, rol: TIPOS[tipo].rol, [TIPOS[tipo].campo]: id }));
      aviso('Invitación enviada.');
      recargar();
    } catch (e) { error(e); }
  });
}
