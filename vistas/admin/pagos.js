import * as G from '../../services/pagos.js';
import { listarContratos } from '../../services/contratos.js';
import { esc, formatoPesos, formatoFecha, hoyBogota } from '../../lib/formato.js';
import { alEnviar, aviso, opciones, vacio } from '../../lib/ui.js';

export async function render(el, ctx) {
  const [contratos, pagos] = await Promise.all([listarContratos(), G.listarPagos()]);
  const preseleccion = ctx.params?.[0] ?? null;
  let clave = G.nuevaClave();

  el.innerHTML = `
    <h1>Pagos en efectivo</h1>
    <section class="tarjeta">
      <h2>Registrar pago</h2>
      <form id="f-pago">
        <label>Inquilino y unidad<select name="contrato_id" required>${opciones(contratos, preseleccion, {
          texto: (c) => `${c.inquilino} – ${c.unidad} (${c.propiedad})${c.estado === 'terminado' ? ' · terminado' : ''}`, vacio: 'Seleccione…' })}</select></label>
        <div id="cuenta" class="secundario"></div>
        <div class="fila">
          <label>Valor recibido (pesos)<input name="valor" data-numero inputmode="numeric" required></label>
          <label>Fecha<input name="fecha" type="date" value="${hoyBogota()}" required></label>
        </div>
        <button type="submit">Registrar y generar recibo</button>
      </form>
    </section>
    <section class="tarjeta">
      <h2>Últimos recibos</h2>
      ${pagos.length ? `<ul class="lista">${pagos.slice(0, 50).map((p) => `
        <li><a href="#/recibo/${p.id}" style="text-decoration:none;color:inherit;flex:1">
            <div class="principal">N.º ${p.numero} · ${esc(p.inquilino)}</div>
            <div class="secundario">${esc(p.unidad)} · ${formatoFecha(p.fecha)}</div></a>
          <div style="text-align:right"><div class="monto">${formatoPesos(p.valor)}</div>
            ${p.estado === 'anulado' ? '<span class="etiqueta peligro">Anulado</span>' : ''}</div></li>`).join('')}</ul>` : vacio('Aún no hay pagos.')}
    </section>`;

  const form = el.querySelector('#f-pago');
  const mostrarCuenta = async () => {
    const cuenta = el.querySelector('#cuenta');
    if (!form.contrato_id.value) { cuenta.textContent = ''; return; }
    const s = await G.estadoDeCuenta(form.contrato_id.value);
    cuenta.innerHTML = `Saldo pendiente: <strong>${formatoPesos(s.saldo_pendiente)}</strong>${s.saldo_a_favor > 0 ? ` · Saldo a favor: ${formatoPesos(s.saldo_a_favor)}` : ''}`;
  };
  form.contrato_id.onchange = () => { clave = G.nuevaClave(); mostrarCuenta(); };
  form.valor.oninput = () => { clave = G.nuevaClave(); };
  mostrarCuenta();

  alEnviar(form, async (d) => {
    // La clave no se renueva: si el pago se reenvía sin cambios, la base devuelve el mismo recibo.
    const pago = await G.registrarPago({ ...d, clave });
    form.querySelectorAll('input, select, button').forEach((x) => { x.disabled = true; });
    aviso(`Recibo N.º ${pago.numero} generado.`);
    ctx.navegar(`recibo/${pago.id}`);
  });
}
