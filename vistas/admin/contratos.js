import * as C from '../../services/contratos.js';
import { listarUnidades } from '../../services/propiedades.js';
import { listarInquilinos } from '../../services/personas.js';
import { esc, formatoPesos, formatoFecha, hoyBogota, TIPOS_UNIDAD } from '../../lib/formato.js';
import { modal, alEnviar, aviso, opciones, vacio } from '../../lib/ui.js';

export async function render(el) {
  const [contratos, unidades, inquilinos] = await Promise.all([C.listarContratos(), listarUnidades(), listarInquilinos()]);
  const activos = contratos.filter((c) => c.estado === 'activo');
  const terminados = contratos.filter((c) => c.estado === 'terminado');
  const recargar = () => render(el);

  const fila = (c) => `
    <li>
      <div><div class="principal">${esc(c.unidad)} · ${esc(c.propiedad)}</div>
        <div class="secundario">${esc(c.inquilino)} · desde ${formatoFecha(c.fecha_inicio)}${c.fecha_fin ? ' hasta ' + formatoFecha(c.fecha_fin) : ''} · paga el día ${c.dia_pago}</div></div>
      <div style="text-align:right"><div class="monto">${formatoPesos(c.canon)}</div>
        ${c.estado === 'activo' ? `<button type="button" class="boton-peligro boton-chico" data-terminar="${c.id}">Terminar</button>` : '<span class="etiqueta neutra">Terminado</span>'}</div>
    </li>`;

  el.innerHTML = `
    <div class="tarjeta-cabecera"><h1>Contratos</h1><button type="button" id="nuevo">+ Contrato</button></div>
    <section class="tarjeta"><h2>Activos (${activos.length})</h2>
      ${activos.length ? `<ul class="lista">${activos.map(fila).join('')}</ul>` : vacio('No hay contratos activos.')}</section>
    ${terminados.length ? `<section class="tarjeta"><h2>Terminados</h2><ul class="lista">${terminados.map(fila).join('')}</ul></section>` : ''}`;

  el.querySelector('#nuevo').onclick = () => {
    const libres = unidades.filter((u) => u.estado === 'disponible');
    const m = modal('Nuevo contrato', `
      <form>
        <label>Unidad<select name="unidad_id" required>${opciones(libres, null, {
          texto: (u) => `${u.propiedad} – ${u.identificador} (${TIPOS_UNIDAD[u.tipo]}, ${formatoPesos(u.canon)})`, vacio: libres.length ? 'Seleccione…' : 'No hay unidades disponibles' })}</select></label>
        <label>Inquilino<select name="inquilino_id" required>${opciones(inquilinos, null, { vacio: 'Seleccione…' })}</select></label>
        <div class="fila">
          <label>Fecha de inicio<input name="fecha_inicio" type="date" value="${hoyBogota()}" required></label>
          <label>Día de pago<input name="dia_pago" data-numero inputmode="numeric" value="5" required></label>
        </div>
        <label>Canon pactado (pesos)<input name="canon" data-numero inputmode="numeric" placeholder="Vacío = canon de la unidad"></label>
        <button type="submit">Crear contrato</button>
      </form>`);
    alEnviar(m.el.querySelector('form'), async (d) => { await C.crearContrato(d); m.cerrar(); aviso('Contrato creado.'); recargar(); });
  };

  el.querySelectorAll('[data-terminar]').forEach((b) => b.onclick = () => {
    const c = contratos.find((x) => x.id === b.dataset.terminar);
    const m = modal(`Terminar contrato – ${c.unidad}`, `
      <form>
        <p>${esc(c.inquilino)} deja la unidad. El último mes se cobra proporcional a los días.</p>
        <label>Fecha de terminación<input name="fecha_fin" type="date" value="${hoyBogota()}" required></label>
        <button type="submit" class="boton-peligro">Terminar contrato</button>
      </form>`);
    alEnviar(m.el.querySelector('form'), async (d) => { await C.terminarContrato(c.id, d.fecha_fin); m.cerrar(); aviso('Contrato terminado.'); recargar(); });
  });
}
