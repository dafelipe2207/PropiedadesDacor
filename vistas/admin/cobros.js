import * as K from '../../services/cobros.js';
import { esc, formatoPesos, formatoFecha, nombrePeriodo, periodoActual } from '../../lib/formato.js';
import { enlaceWhatsApp, mensajeCobro } from '../../lib/whatsapp.js';
import { aviso, vacio, conCarga, error } from '../../lib/ui.js';

const estado = { periodo: periodoActual() };
const ESTADOS = { pendiente: ['Pendiente', 'alerta'], parcial: ['Abonado', 'alerta'], pagado: ['Pagado', ''] };

export async function render(el, ctx) {
  const cobros = await K.listarCobros({ periodo: estado.periodo });
  const lineas = await K.lineasDeCobros(cobros.map((k) => k.id));
  const total = cobros.reduce((s, k) => s + k.total, 0);
  const pendiente = cobros.reduce((s, k) => s + k.saldo, 0);

  el.innerHTML = `
    <h1>Cobros</h1>
    <div class="fila" style="margin-bottom:1rem;align-items:end">
      <label>Mes<input id="sel-periodo" type="month" value="${estado.periodo}"></label>
      <button type="button" id="generar">Generar cobros</button>
    </div>
    <p class="secundario">Genere los cobros después de cerrar los servicios del mes. Si cierra un servicio más tarde, vuelva a generar: solo se agrega lo que falta.</p>
    <div class="cifras" style="margin-bottom:1rem">
      <div class="cifra"><span>Total ${esc(nombrePeriodo(estado.periodo))}</span><strong>${formatoPesos(total)}</strong></div>
      <div class="cifra"><span>Por recaudar</span><strong>${formatoPesos(pendiente)}</strong></div>
    </div>
    ${cobros.length ? cobros.map((k) => {
      const ls = lineas.filter((l) => l.cobro_id === k.id);
      const wa = enlaceWhatsApp(k.telefono, mensajeCobro(k, ls));
      return `
      <section class="tarjeta">
        <div class="tarjeta-cabecera">
          <div><h3>${esc(k.unidad)} · ${esc(k.propiedad)}</h3><div class="secundario">${esc(k.inquilino)} · vence ${formatoFecha(k.fecha_limite)}</div></div>
          <span class="etiqueta ${ESTADOS[k.estado][1]}">${ESTADOS[k.estado][0]}</span>
        </div>
        <table><tbody>
          ${ls.map((l) => `<tr><td>${esc(l.descripcion)}</td><td class="num">${formatoPesos(l.valor)}</td></tr>`).join('')}
          <tr><th>Total</th><th class="num">${formatoPesos(k.total)}</th></tr>
          ${k.saldo !== k.total ? `<tr><td>Saldo</td><td class="num"><strong>${formatoPesos(k.saldo)}</strong></td></tr>` : ''}
        </tbody></table>
        <div class="acciones" style="margin-top:.75rem">
          ${k.saldo > 0 ? `<a class="boton boton-chico" href="#/pagos/${k.contrato_id}">Registrar pago</a>` : ''}
          ${wa ? `<a class="boton boton-secundario boton-chico" href="${wa}" target="_blank" rel="noopener">Enviar por WhatsApp</a>` : '<span class="secundario">Sin celular registrado</span>'}
        </div>
      </section>`;
    }).join('') : vacio(`No hay cobros de ${nombrePeriodo(estado.periodo)}.`)}`;

  el.querySelector('#sel-periodo').onchange = (ev) => { if (ev.target.value) { estado.periodo = ev.target.value; render(el, ctx); } };
  el.querySelector('#generar').onclick = async (ev) => {
    try {
      const n = await conCarga(ev.target, () => K.generarCobros(estado.periodo));
      aviso(n ? `Se agregaron ${n} conceptos a los cobros.` : 'Los cobros ya estaban al día.');
      render(el, ctx);
    } catch (e) { error(e); }
  };
}
