// Recibo de caja (visible para el administrador, el inquilino y el propietario según permisos).
import * as G from '../services/pagos.js';
import { esc, formatoPesos, formatoFecha, nombrePeriodo } from '../lib/formato.js';
import { enlaceWhatsApp, mensajeRecibo } from '../lib/whatsapp.js';
import { modal, alEnviar, aviso } from '../lib/ui.js';
import { NOMBRE_APP } from '../config.js';

export async function render(el, ctx) {
  const id = ctx.params?.[0];
  const r = await G.obtenerRecibo(id).catch(() => null);
  if (!r) { el.innerHTML = '<p class="caja-error">Recibo no encontrado.</p>'; return; }
  const esAdmin = ctx.perfil.rol === 'admin';
  const d = r.detalle ?? {};
  const wa = esAdmin && r.estado === 'vigente' ? enlaceWhatsApp(r.telefono, mensajeRecibo(r)) : null;

  el.innerHTML = `
    <article class="recibo">
      ${r.estado === 'anulado' ? '<div class="sello-anulado">ANULADO</div>' : ''}
      <div class="secundario">${esc(NOMBRE_APP)}</div>
      <h1 class="recibo-numero">Recibo de caja N.º ${r.numero}</h1>
      <dl>
        <dt>Fecha</dt><dd>${formatoFecha(r.fecha)}</dd>
        <dt>Recibido de</dt><dd>${esc(r.inquilino)}</dd>
        <dt>Unidad</dt><dd>${esc(r.unidad)} · ${esc(r.propiedad)}</dd>
        <dt>Forma de pago</dt><dd>Efectivo</dd>
        <dt>Valor</dt><dd><strong>${formatoPesos(r.valor)}</strong></dd>
        ${(d.conceptos ?? []).map((c) => `<dt>Abono a ${esc(nombrePeriodo(c.periodo))}</dt><dd>${formatoPesos(c.valor)}</dd>`).join('')}
        <dt>Saldo pendiente</dt><dd>${formatoPesos(d.saldo_pendiente ?? 0)}</dd>
        ${Number(d.saldo_a_favor) > 0 ? `<dt>Saldo a favor</dt><dd>${formatoPesos(d.saldo_a_favor)}</dd>` : ''}
        <dt>Recibió</dt><dd>${esc(r.recibido_por_nombre)}</dd>
      </dl>
      ${r.estado === 'anulado' ? `<p class="caja-error">Anulado el ${formatoFecha(r.anulado_en)}. Motivo: ${esc(r.motivo_anulacion)}</p>` : ''}
      <p class="ayuda">Los saldos corresponden al momento de emitir el recibo.</p>
    </article>
    <div class="acciones no-imprimir" style="justify-content:center;margin-top:1rem">
      <button type="button" class="boton-secundario" id="imprimir">Imprimir</button>
      ${wa ? `<a class="boton" href="${wa}" target="_blank" rel="noopener">Enviar por WhatsApp</a>` : ''}
      ${esAdmin && r.estado === 'vigente' ? '<button type="button" class="boton-peligro" id="anular">Anular</button>' : ''}
    </div>`;

  el.querySelector('#imprimir').onclick = () => window.print();
  const b = el.querySelector('#anular');
  if (b) b.onclick = () => {
    const m = modal(`Anular recibo N.º ${r.numero}`, `
      <form>
        <p>El número ${r.numero} quedará como anulado y los saldos se recalculan. Si el pago era real, registre uno nuevo con el valor correcto.</p>
        <label>Motivo<textarea name="motivo" rows="3" required></textarea></label>
        <button type="submit" class="boton-peligro">Anular recibo</button>
      </form>`);
    alEnviar(m.el.querySelector('form'), async ({ motivo }) => {
      await G.anularRecibo(r.id, motivo);
      m.cerrar(); aviso('Recibo anulado.'); render(el, ctx);
    });
  };
}
