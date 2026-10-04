// Vista del propietario: ocupación, recaudo, cartera, diferencias de servicios y entregas de efectivo.
import * as R from '../services/reportes.js';
import * as E from '../services/entregas.js';
import { listarPropiedades, listarUnidades } from '../services/propiedades.js';
import { esc, formatoPesos, formatoFecha, nombrePeriodo, periodoActual, TIPOS_UNIDAD } from '../lib/formato.js';
import { modal, alEnviar, aviso, vacio, conCarga, error } from '../lib/ui.js';
import { bloqueRecaudo, bloqueCartera, bloqueDiferencias } from './admin/reportes.js';

const estado = { periodo: periodoActual() };

export async function render(el, ctx) {
  const [resumen, entregas, propiedades, unidades, recaudo, cartera, diferencias] = await Promise.all([
    R.resumenPropietario(), E.listarEntregas(), listarPropiedades(), listarUnidades(),
    R.recaudo(estado.periodo), R.cartera(), R.diferencias(estado.periodo)]);
  const pendientes = entregas.filter((e) => e.estado === 'pendiente_confirmar');

  el.innerHTML = `
    <h1>Resumen</h1>
    <div class="cifras" style="margin-bottom:1rem">
      <div class="cifra"><span>Efectivo en manos del administrador</span><strong>${formatoPesos(resumen.en_caja_admin)}</strong></div>
      <div class="cifra"><span>Entregas por confirmar</span><strong>${formatoPesos(resumen.por_confirmar)}</strong></div>
      <div class="cifra"><span>Recibido (confirmado)</span><strong>${formatoPesos(resumen.entregado_confirmado)}</strong></div>
    </div>
    ${pendientes.map((e) => `
      <section class="tarjeta" style="border:2px solid var(--ambar-claro)">
        <div class="tarjeta-cabecera"><h2>Entrega del ${formatoFecha(e.fecha)}</h2><span class="monto">${formatoPesos(e.valor)}</span></div>
        <p class="secundario">${e.recibos} recibo(s) · registrada por ${esc(e.registrada_por_nombre)}. ¿Recibió este dinero?</p>
        <div class="acciones">
          <button type="button" data-ver="${e.id}" class="boton-secundario boton-chico">Ver recibos</button>
          <button type="button" data-confirmar="${e.id}" class="boton-chico">Sí, lo recibí</button>
          <button type="button" data-rechazar="${e.id}" class="boton-peligro boton-chico">No cuadra</button>
        </div>
      </section>`).join('')}
    <label style="max-width:220px;margin-bottom:1rem">Mes<input id="sel-periodo" type="month" value="${estado.periodo}"></label>
    <section class="tarjeta"><h2>Recaudo de ${esc(nombrePeriodo(estado.periodo))}</h2>${bloqueRecaudo(recaudo, propiedades)}</section>
    <section class="tarjeta"><h2>Cartera en mora</h2>${bloqueCartera(cartera)}</section>
    <section class="tarjeta"><h2>Diferencia de servicios</h2>
      <p class="secundario">Parte de las facturas compartidas que no se cobra a inquilinos (áreas comunes, pérdidas, desocupadas).</p>${bloqueDiferencias(diferencias, propiedades)}</section>
    ${propiedades.map((p) => {
      const us = unidades.filter((u) => u.propiedad_id === p.id);
      return `<section class="tarjeta"><div class="tarjeta-cabecera"><h2>${esc(p.nombre)}</h2>
        <span class="etiqueta">${us.filter((u) => u.estado === 'ocupada').length} de ${us.filter((u) => u.estado !== 'inactiva').length} ocupadas</span></div>
        <ul class="lista">${us.map((u) => `<li><div><div class="principal">${esc(u.identificador)}</div>
          <div class="secundario">${TIPOS_UNIDAD[u.tipo]}${u.inquilino ? ' · ' + esc(u.inquilino) : ' · disponible'}</div></div>
          <span class="monto">${formatoPesos(u.canon)}</span></li>`).join('')}</ul></section>`;
    }).join('')}
    <section class="tarjeta"><h2>Historial de entregas</h2>
      ${entregas.length ? `<ul class="lista">${entregas.map((e) => `<li><div><div class="principal">${formatoFecha(e.fecha)}</div>
        <div class="secundario">${e.recibos} recibo(s)${e.comentario ? ' · ' + esc(e.comentario) : ''}</div></div>
        <div style="text-align:right"><div class="monto">${formatoPesos(e.valor)}</div><span class="secundario">${{ pendiente_confirmar: 'Por confirmar', confirmada: 'Confirmada', rechazada: 'Rechazada' }[e.estado]}</span></div></li>`).join('')}</ul>` : vacio('Aún no hay entregas.')}
    </section>`;

  el.querySelector('#sel-periodo').onchange = (ev) => { if (ev.target.value) { estado.periodo = ev.target.value; render(el, ctx); } };
  el.querySelectorAll('[data-ver]').forEach((b) => b.onclick = async () => {
    try {
      const recibos = await E.recibosDeEntrega(b.dataset.ver);
      modal('Recibos de la entrega', `<ul class="lista">${recibos.map((r) => `<li><a href="#/recibo/${r.id}" data-cerrar>N.º ${r.numero} · ${esc(r.inquilino)} · ${esc(r.unidad)}</a><span class="monto">${formatoPesos(r.valor)}</span></li>`).join('')}</ul>`);
    } catch (e) { error(e); }
  });
  el.querySelectorAll('[data-confirmar]').forEach((b) => b.onclick = async () => {
    try { await conCarga(b, () => E.responderEntrega(b.dataset.confirmar, true)); aviso('Entrega confirmada.'); render(el, ctx); } catch (e) { error(e); }
  });
  el.querySelectorAll('[data-rechazar]').forEach((b) => b.onclick = () => {
    const m = modal('Rechazar entrega', `<form><label>¿Qué no cuadra?<textarea name="comentario" rows="3" required placeholder="Ej. recibí $450.000"></textarea></label>
      <button type="submit" class="boton-peligro">Rechazar</button></form>`);
    alEnviar(m.el.querySelector('form'), async ({ comentario }) => {
      await E.responderEntrega(b.dataset.rechazar, false, comentario); m.cerrar(); aviso('Entrega rechazada. El administrador verá su comentario.'); render(el, ctx);
    });
  });
}
