// Caja del administrador: efectivo recibido por propietario y registro de entregas.
import * as E from '../../services/entregas.js';
import { listarPropietarios } from '../../services/personas.js';
import { esc, formatoPesos, formatoFecha, hoyBogota } from '../../lib/formato.js';
import { aviso, vacio, conCarga, error } from '../../lib/ui.js';

const ESTADOS = { pendiente_confirmar: ['Por confirmar', 'alerta'], confirmada: ['Confirmada', ''], rechazada: ['Rechazada', 'peligro'] };

export async function render(el, ctx) {
  const [caja, propietarios, entregas] = await Promise.all([E.cajaAdmin(), listarPropietarios(), E.listarEntregas()]);
  const porPropietario = propietarios.map((p) => ({ ...p, recibos: caja.filter((r) => r.propietario_id === p.id) })).filter((p) => p.recibos.length);

  el.innerHTML = `
    <h1>Caja</h1>
    <p class="secundario">Efectivo recibido que aún no ha entregado a cada propietario. Marque los recibos que entrega y regístrelo; el propietario debe confirmarlo en su cuenta.</p>
    ${porPropietario.length ? porPropietario.map((p) => `
      <section class="tarjeta">
        <form data-propietario="${p.id}">
          <div class="tarjeta-cabecera"><h2>${esc(p.nombre)}</h2><span class="monto">${formatoPesos(p.recibos.reduce((s, r) => s + r.valor, 0))}</span></div>
          <ul class="lista">${p.recibos.map((r) => `
            <li><label class="casilla" style="flex:1"><input type="checkbox" name="pago" value="${r.pago_id}" data-valor="${r.valor}" checked>
              <span><span class="principal">N.º ${r.numero} · ${esc(r.inquilino)}</span><br><span class="secundario">${esc(r.unidad)} · ${formatoFecha(r.fecha)}</span></span></label>
              <span class="monto">${formatoPesos(r.valor)}</span></li>`).join('')}</ul>
          <div class="fila" style="align-items:end">
            <label>Fecha de entrega<input type="date" name="fecha" value="${hoyBogota()}" required></label>
            <button type="submit">Entregar <span data-total></span></button>
          </div>
        </form>
      </section>`).join('') : vacio('No hay efectivo pendiente por entregar.')}
    <section class="tarjeta">
      <h2>Entregas</h2>
      ${entregas.length ? `<ul class="lista">${entregas.map((e) => `
        <li><div><div class="principal">${esc(e.propietario)} · ${formatoFecha(e.fecha)}</div>
            <div class="secundario">${e.recibos} recibo(s)${e.comentario ? ' · ' + esc(e.comentario) : ''}</div></div>
          <div style="text-align:right"><div class="monto">${formatoPesos(e.valor)}</div>
            <span class="etiqueta ${ESTADOS[e.estado][1]}">${ESTADOS[e.estado][0]}</span></div></li>`).join('')}</ul>` : vacio('Aún no hay entregas.')}
    </section>`;

  el.querySelectorAll('form[data-propietario]').forEach((form) => {
    const total = () => [...form.querySelectorAll('[name=pago]:checked')].reduce((s, c) => s + Number(c.dataset.valor), 0);
    const pintar = () => { form.querySelector('[data-total]').textContent = formatoPesos(total()); };
    form.querySelectorAll('[name=pago]').forEach((c) => c.onchange = pintar);
    pintar();
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const pagos = [...form.querySelectorAll('[name=pago]:checked')].map((c) => c.value);
      if (!window.confirm(`¿Registrar entrega de ${formatoPesos(total())}?`)) return;
      try {
        await conCarga(form.querySelector('[type=submit]'), () => E.registrarEntrega({ propietario_id: form.dataset.propietario, fecha: form.fecha.value, pagos }));
        aviso('Entrega registrada. El propietario debe confirmarla.');
        render(el, ctx);
      } catch (e) { error(e); }
    };
  });
}
