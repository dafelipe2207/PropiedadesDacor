// Vista del inquilino: estado de cuenta por contrato, detalle de servicios con lecturas y recibos.
import * as R from '../services/reportes.js';
import * as S from '../services/servicios.js';
import { esc, formatoPesos, formatoFecha, nombrePeriodo, TIPOS_UNIDAD } from '../lib/formato.js';
import { modal, vacio, error } from '../lib/ui.js';

const ESTADOS = { pendiente: ['Pendiente', 'alerta'], parcial: ['Abonado', 'alerta'], pagado: ['Pagado', ''] };

export async function render(el) {
  const cuentas = await R.estadoCuentaInquilino();
  if (!cuentas.length) { el.innerHTML = `<h1>Mi cuenta</h1>${vacio('No tiene contratos registrados.')}`; return; }

  el.innerHTML = cuentas.map(({ contrato: c, cobros, pagos, lineas, saldo_pendiente: saldo }) => `
    <h1>${esc(c.unidad)} · ${esc(c.propiedad)}</h1>
    <p class="secundario">${TIPOS_UNIDAD[c.tipo_unidad]} · canon ${formatoPesos(c.canon)} · paga el día ${c.dia_pago}${c.estado === 'terminado' ? ' · contrato terminado' : ''}</p>
    <div class="cifras" style="margin-bottom:1rem">
      <div class="cifra"><span>Saldo pendiente</span><strong>${formatoPesos(saldo)}</strong></div>
    </div>
    <section class="tarjeta"><h2>Cobros</h2>
      ${cobros.length ? cobros.map((k) => `
        <div style="padding:.6rem 0;border-top:1px solid var(--linea)">
          <div class="tarjeta-cabecera"><strong>${esc(nombrePeriodo(k.periodo))}</strong><span class="etiqueta ${ESTADOS[k.estado][1]}">${ESTADOS[k.estado][0]}</span></div>
          <table><tbody>${lineas.filter((l) => l.cobro_id === k.id).map((l) => `<tr><td>${esc(l.descripcion)}
              ${l.factura_id ? ` <a href="#" data-detalle="${l.factura_id}" onclick="return false">detalle</a>` : ''}</td><td class="num">${formatoPesos(l.valor)}</td></tr>`).join('')}
            <tr><th>Total · vence ${formatoFecha(k.fecha_limite)}</th><th class="num">${formatoPesos(k.total)}</th></tr>
            ${k.saldo > 0 && k.saldo !== k.total ? `<tr><td>Saldo</td><td class="num">${formatoPesos(k.saldo)}</td></tr>` : ''}</tbody></table>
        </div>`).join('') : vacio('Aún no hay cobros.')}
    </section>
    <section class="tarjeta"><h2>Recibos de pago</h2>
      ${pagos.length ? `<ul class="lista">${pagos.map((p) => `<li><a href="#/recibo/${p.id}" style="flex:1;color:inherit;text-decoration:none">
          <div class="principal">N.º ${p.numero}</div><div class="secundario">${formatoFecha(p.fecha)}</div></a>
          <div style="text-align:right"><div class="monto">${formatoPesos(p.valor)}</div>${p.estado === 'anulado' ? '<span class="etiqueta peligro">Anulado</span>' : ''}</div></li>`).join('')}</ul>` : vacio('Aún no hay pagos.')}
    </section>`).join('<hr style="margin:2rem 0;border:0;border-top:1px solid var(--linea)">');

  el.querySelectorAll('[data-detalle]').forEach((a) => a.onclick = async () => {
    try {
      const [detalle, [factura]] = await Promise.all([S.detalleServicioCobrado(a.dataset.detalle), S.obtenerFacturas([a.dataset.detalle])]);
      const d = detalle[0];
      const m = modal(`Servicio – ${nombrePeriodo(factura.periodo)}`, `
        <div class="recibo" style="border:0;padding:0"><dl>
          ${d?.lectura !== null && d?.lectura !== undefined ? `<dt>Lectura anterior</dt><dd>${d.anterior}</dd><dt>Lectura actual</dt><dd>${d.lectura}</dd><dt>Consumo</dt><dd>${d.consumo}</dd>
          <dt>Tarifa (factura ÷ consumo total)</dt><dd>${formatoPesos(d.tarifa)} por unidad</dd>` : ''}
          <dt>Factura total del servicio</dt><dd>${formatoPesos(factura.valor)}</dd>
          <dt>Su parte</dt><dd><strong>${formatoPesos(d?.valor ?? 0)}</strong></dd>
        </dl></div>
        ${factura.archivo ? '<button type="button" id="ver-factura" class="boton-secundario">Ver factura</button>' : ''}`);
      const b = m.el.querySelector('#ver-factura');
      if (b) b.onclick = async () => { try { window.open(await S.urlArchivo(factura.archivo), '_blank'); } catch (e) { error(e); } };
    } catch (e) { error(e); }
  });
}
