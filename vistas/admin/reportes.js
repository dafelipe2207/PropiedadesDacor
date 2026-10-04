import * as R from '../../services/reportes.js';
import { listarPropiedades } from '../../services/propiedades.js';
import { esc, formatoPesos, nombrePeriodo, periodoActual, TIPOS_UNIDAD } from '../../lib/formato.js';
import { enlaceWhatsApp, mensajeMora } from '../../lib/whatsapp.js';
import { vacio } from '../../lib/ui.js';

const estado = { periodo: periodoActual() };

// Bloques de reporte compartidos con la vista del propietario.
export function bloqueRecaudo(filas, propiedades) {
  if (!filas.length) return vacio('Sin cobros en este mes.');
  const nombre = Object.fromEntries(propiedades.map((p) => [p.id, p.nombre]));
  const t = (c) => filas.reduce((s, f) => s + f[c], 0);
  const fila = (titulo, sub, a, s, r) => `<li><div><div class="principal">${titulo}</div>
      <div class="secundario">${sub}Arriendo ${formatoPesos(a)} · Servicios ${formatoPesos(s)}</div></div>
    <div style="text-align:right"><div class="monto">${formatoPesos(r)}</div><div class="secundario">de ${formatoPesos(a + s)}</div></div></li>`;
  return `<ul class="lista">${filas.map((f) => fila(esc(nombre[f.propiedad_id] ?? ''), `${TIPOS_UNIDAD[f.tipo_unidad]} · `,
      f.cobrado_arriendo, f.cobrado_servicios, f.recaudado)).join('')}
    ${fila('Total recaudado', '', t('cobrado_arriendo'), t('cobrado_servicios'), t('recaudado'))}</ul>`;
}

export function bloqueCartera(filas, { conWhatsApp = false } = {}) {
  if (!filas.length) return vacio('Nadie está en mora.');
  return `<ul class="lista">${filas.map((k) => {
    const wa = conWhatsApp ? enlaceWhatsApp(k.telefono, mensajeMora(k)) : null;
    return `<li><div><div class="principal">${esc(k.unidad)} · ${esc(k.inquilino)}</div>
      <div class="secundario">${esc(nombrePeriodo(k.periodo))} · ${k.dias_mora} días de atraso</div></div>
      <div style="text-align:right"><div class="monto">${formatoPesos(k.saldo)}</div>
        ${wa ? `<a class="boton boton-secundario boton-chico" href="${wa}" target="_blank" rel="noopener">Recordar</a>` : ''}</div></li>`;
  }).join('')}</ul>`;
}

export function bloqueDiferencias(filas, propiedades) {
  if (!filas.length) return vacio('Sin servicios compartidos cerrados en este mes.');
  const nombre = Object.fromEntries(propiedades.map((p) => [p.id, p.nombre]));
  return `<ul class="lista">${filas.map((d) => `<li><div><div class="principal">${esc(d.servicio)}</div>
    <div class="secundario">${esc(nombre[d.propiedad_id] ?? '')}</div></div><span class="monto">${formatoPesos(d.diferencia)}</span></li>`).join('')}</ul>`;
}

export async function render(el, ctx) {
  const [recaudo, cartera, diferencias, propiedades] = await Promise.all([
    R.recaudo(estado.periodo), R.cartera(), R.diferencias(estado.periodo), listarPropiedades()]);
  el.innerHTML = `
    <h1>Reportes</h1>
    <label style="max-width:220px;margin-bottom:1rem">Mes<input id="sel-periodo" type="month" value="${estado.periodo}"></label>
    <section class="tarjeta"><h2>Recaudo de ${esc(nombrePeriodo(estado.periodo))}</h2>${bloqueRecaudo(recaudo, propiedades)}</section>
    <section class="tarjeta"><h2>Cartera en mora</h2>${bloqueCartera(cartera, { conWhatsApp: true })}</section>
    <section class="tarjeta"><h2>Diferencia de servicios para el propietario</h2>
      <p class="secundario">Áreas comunes, pérdidas y unidades desocupadas.</p>${bloqueDiferencias(diferencias, propiedades)}</section>`;
  el.querySelector('#sel-periodo').onchange = (ev) => { if (ev.target.value) { estado.periodo = ev.target.value; render(el, ctx); } };
}
