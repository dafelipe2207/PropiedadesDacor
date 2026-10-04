// Inicio del administrador: cifras del mes y pendientes.
import { listarUnidades } from '../../services/propiedades.js';
import * as R from '../../services/reportes.js';
import { cajaAdmin } from '../../services/entregas.js';
import { listarServicios, listarFacturas } from '../../services/servicios.js';
import { formatoPesos, nombrePeriodo, periodoActual } from '../../lib/formato.js';
import { vacio } from '../../lib/ui.js';

export async function render(el) {
  const periodo = periodoActual();
  const [unidades, recaudo, cartera, caja, servicios, facturas] = await Promise.all([
    listarUnidades(), R.recaudo(periodo), R.cartera(), cajaAdmin(), listarServicios(), listarFacturas(periodo)]);
  if (!unidades.length) {
    el.innerHTML = `<h1>Inicio</h1>${vacio('Empiece registrando propietarios e inquilinos en Personas, luego sus propiedades.')}`;
    return;
  }
  const cobrado = recaudo.reduce((s, r) => s + r.cobrado_arriendo + r.cobrado_servicios, 0);
  const recaudado = recaudo.reduce((s, r) => s + r.recaudado, 0);
  const sinCerrar = servicios.filter((s) => s.activo && !facturas.some((f) => f.servicio_id === s.id && f.cerrada)).length;
  const pendientes = [
    sinCerrar && `<li><a href="#/servicios">${sinCerrar} servicio(s) sin cerrar en ${nombrePeriodo(periodo)}</a></li>`,
    !recaudo.length && `<li><a href="#/cobros">Aún no se han generado los cobros de ${nombrePeriodo(periodo)}</a></li>`,
    cartera.length && `<li><a href="#/reportes">${cartera.length} cobro(s) en mora</a></li>`,
    caja.length && `<li><a href="#/caja">${caja.length} recibo(s) por entregar al propietario</a></li>`,
  ].filter(Boolean);

  el.innerHTML = `
    <h1>Inicio</h1>
    <div class="cifras" style="margin-bottom:1rem">
      <div class="cifra"><span>Ocupadas</span><strong>${unidades.filter((u) => u.estado === 'ocupada').length} / ${unidades.filter((u) => u.estado !== 'inactiva').length}</strong></div>
      <div class="cifra"><span>Cobrado ${nombrePeriodo(periodo)}</span><strong>${formatoPesos(cobrado)}</strong></div>
      <div class="cifra"><span>Recaudado</span><strong>${formatoPesos(recaudado)}</strong></div>
      <div class="cifra"><span>En mora</span><strong>${formatoPesos(cartera.reduce((s, k) => s + k.saldo, 0))}</strong></div>
      <div class="cifra"><span>Efectivo en caja</span><strong>${formatoPesos(caja.reduce((s, r) => s + r.valor, 0))}</strong></div>
    </div>
    <section class="tarjeta"><h2>Pendientes</h2>
      ${pendientes.length ? `<ul class="lista">${pendientes.join('')}</ul>` : vacio('Todo al día.')}</section>`;
}
