import * as P from '../../services/propiedades.js';
import { listarPropietarios } from '../../services/personas.js';
import { esc, formatoPesos, TIPOS_UNIDAD } from '../../lib/formato.js';
import { modal, alEnviar, aviso, opciones, vacio } from '../../lib/ui.js';

const ESTADOS = { disponible: ['Disponible', 'alerta'], ocupada: ['Ocupada', ''], inactiva: ['Inactiva', 'neutra'] };

export async function render(el) {
  const [propiedades, unidades, propietarios] = await Promise.all([P.listarPropiedades(), P.listarUnidades(), listarPropietarios()]);
  const recargar = () => render(el);

  el.innerHTML = `
    <div class="tarjeta-cabecera"><h1>Propiedades</h1>
      <button type="button" id="nueva">+ Propiedad</button></div>
    ${propiedades.length ? '' : vacio(propietarios.length ? 'Aún no hay propiedades.' : 'Primero registre un propietario en Personas.')}
    ${propiedades.map((p) => {
      const us = unidades.filter((u) => u.propiedad_id === p.id);
      const dueno = propietarios.find((x) => x.id === p.propietario_id);
      return `
      <section class="tarjeta">
        <div class="tarjeta-cabecera">
          <div><h2>${esc(p.nombre)}</h2>
            <div class="secundario">${esc([p.direccion, p.ciudad].filter(Boolean).join(', '))} · Propietario: ${esc(dueno?.nombre ?? '—')}</div></div>
          <div class="acciones">
            <button type="button" class="boton-secundario boton-chico" data-editar="${p.id}">Editar</button>
            <button type="button" class="boton-chico" data-unidad="${p.id}">+ Unidad</button>
          </div>
        </div>
        ${us.length ? `<ul class="lista">${us.map((u) => `
          <li data-editar-unidad="${u.id}">
            <div><div class="principal">${esc(u.identificador)}</div>
              <div class="secundario">${TIPOS_UNIDAD[u.tipo]}${u.inquilino ? ' · ' + esc(u.inquilino) : ''}</div></div>
            <div style="text-align:right"><div class="monto">${formatoPesos(u.canon)}</div>
              <span class="etiqueta ${ESTADOS[u.estado][1]}">${ESTADOS[u.estado][0]}</span></div>
          </li>`).join('')}</ul>` : vacio('Sin unidades.')}
      </section>`;
    }).join('')}`;

  const formPropiedad = (p = {}) => `
    <form>
      <label>Nombre<input name="nombre" value="${esc(p.nombre ?? '')}" required></label>
      <label>Dirección<input name="direccion" value="${esc(p.direccion ?? '')}"></label>
      <label>Ciudad<input name="ciudad" value="${esc(p.ciudad ?? '')}"></label>
      <label>Propietario<select name="propietario_id" required>${opciones(propietarios, p.propietario_id, { vacio: 'Seleccione…' })}</select></label>
      <button type="submit">Guardar</button>
    </form>`;

  el.querySelector('#nueva').onclick = () => {
    const m = modal('Nueva propiedad', formPropiedad());
    alEnviar(m.el.querySelector('form'), async (d) => { await P.crearPropiedad(d); m.cerrar(); aviso('Propiedad creada.'); recargar(); });
  };
  el.querySelectorAll('[data-editar]').forEach((b) => b.onclick = () => {
    const p = propiedades.find((x) => x.id === b.dataset.editar);
    const m = modal('Editar propiedad', formPropiedad(p));
    alEnviar(m.el.querySelector('form'), async (d) => { await P.actualizarPropiedad(p.id, d); m.cerrar(); aviso('Guardado.'); recargar(); });
  });

  const formUnidad = (u = {}) => `
    <form>
      <label>Tipo<select name="tipo" required>${opciones(Object.entries(TIPOS_UNIDAD), u.tipo, { valor: (x) => x[0], texto: (x) => x[1], vacio: 'Seleccione…' })}</select></label>
      <label>Identificador<input name="identificador" value="${esc(u.identificador ?? '')}" placeholder="Apto 201, Local 1…" required></label>
      <label>Canon mensual (pesos)<input name="canon" data-numero inputmode="numeric" value="${u.canon ?? ''}" required>
        <span class="ayuda">Cambiar el canon no modifica los contratos que ya existen.</span></label>
      ${u.id ? `<label>Estado<select name="estado">${opciones([['disponible', 'Disponible'], ['inactiva', 'Inactiva']], u.estado === 'ocupada' ? '' : u.estado,
        { valor: (x) => x[0], texto: (x) => x[1], vacio: u.estado === 'ocupada' ? 'Ocupada (tiene contrato)' : null })}</select></label>` : ''}
      <button type="submit">Guardar</button>
    </form>`;

  el.querySelectorAll('[data-unidad]').forEach((b) => b.onclick = () => {
    const m = modal('Nueva unidad', formUnidad());
    alEnviar(m.el.querySelector('form'), async (d) => {
      await P.crearUnidad({ ...d, propiedad_id: b.dataset.unidad }); m.cerrar(); aviso('Unidad creada.'); recargar();
    });
  });
  el.querySelectorAll('[data-editar-unidad]').forEach((li) => {
    li.style.cursor = 'pointer';
    li.onclick = () => {
      const u = unidades.find((x) => x.id === li.dataset.editarUnidad);
      const m = modal(`Editar ${u.identificador}`, formUnidad(u));
      alEnviar(m.el.querySelector('form'), async (d) => { await P.actualizarUnidad(u.id, d); m.cerrar(); aviso('Guardado.'); recargar(); });
    };
  });
}
