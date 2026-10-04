import * as S from '../../services/servicios.js';
import { listarPropiedades, listarUnidades } from '../../services/propiedades.js';
import { esc, formatoPesos, formatoFecha, nombrePeriodo, periodoActual, TIPOS_SERVICIO } from '../../lib/formato.js';
import { modal, alEnviar, aviso, opciones, vacio, conCarga, error, confirmar } from '../../lib/ui.js';

const estado = { periodo: periodoActual(), propiedad: null };

export async function render(el) {
  const propiedades = await listarPropiedades();
  if (!propiedades.length) { el.innerHTML = `<h1>Servicios</h1>${vacio('Primero cree una propiedad.')}`; return; }
  if (!propiedades.some((p) => p.id === estado.propiedad)) estado.propiedad = propiedades[0].id;

  const [servicios, unidades, facturas] = await Promise.all([
    S.listarServicios(estado.propiedad), listarUnidades(estado.propiedad), S.listarFacturas(estado.periodo)]);
  const lecturas = Object.fromEntries(await Promise.all(servicios.filter((s) => s.modalidad === 'compartido')
    .map(async (s) => [s.id, await S.lecturasDelPeriodo(s.id, estado.periodo)])));
  const recargar = () => render(el);

  el.innerHTML = `
    <div class="tarjeta-cabecera"><h1>Servicios</h1><button type="button" id="nuevo-servicio" class="boton-secundario">+ Servicio</button></div>
    <div class="fila no-imprimir" style="margin-bottom:1rem">
      <label>Propiedad<select id="sel-propiedad">${opciones(propiedades, estado.propiedad)}</select></label>
      <label>Mes<input id="sel-periodo" type="month" value="${estado.periodo}"></label>
    </div>
    <p class="secundario">Facturas de ${nombrePeriodo(estado.periodo)}. Cargue la factura, anote las lecturas y cierre cada servicio para que entre en los cobros.</p>
    ${servicios.length ? servicios.map((s) => tarjetaServicio(s, facturas.find((f) => f.servicio_id === s.id), lecturas[s.id])).join('') : vacio('Esta propiedad aún no tiene servicios configurados.')}`;

  el.querySelector('#sel-propiedad').onchange = (ev) => { estado.propiedad = ev.target.value; recargar(); };
  el.querySelector('#sel-periodo').onchange = (ev) => { if (ev.target.value) { estado.periodo = ev.target.value; recargar(); } };

  el.querySelector('#nuevo-servicio').onclick = () => {
    const m = modal('Nuevo servicio', `
      <form>
        <label>Servicio<select name="tipo" required>${opciones(Object.entries(TIPOS_SERVICIO), null, { valor: (x) => x[0], texto: (x) => x[1], vacio: 'Seleccione…' })}</select></label>
        <div class="fila">
          <label>Empresa<input name="empresa" placeholder="EPM, Vanti…"></label>
          <label>N.º de cuenta / contrato<input name="numero_cuenta"></label>
        </div>
        <label>¿Cómo llega la factura?<select name="modalidad" required>
          <option value="individual">Individual: una factura para una sola unidad</option>
          <option value="compartido">Compartida: una factura que se reparte por subcontadores</option></select></label>
        <label data-solo="individual">Unidad<select name="unidad_id">${opciones(unidades, null, { texto: 'identificador', vacio: 'Seleccione…' })}</select></label>
        <label data-solo="compartido" hidden>Unidad de medida<select name="medida"><option value="kWh">kWh</option><option value="m³">m³</option></select></label>
        <button type="submit">Guardar</button>
      </form>`);
    const form = m.el.querySelector('form');
    const alternar = () => form.querySelectorAll('[data-solo]').forEach((x) => { x.hidden = x.dataset.solo !== form.modalidad.value; });
    form.modalidad.onchange = alternar;
    alEnviar(form, async (d) => { await S.crearServicio({ ...d, propiedad_id: estado.propiedad }); m.cerrar(); aviso('Servicio creado.'); recargar(); });
  };

  el.querySelectorAll('[data-subcontador]').forEach((b) => b.onclick = () => {
    const m = modal('Nuevo subcontador', `
      <form>
        <label>Unidad<select name="unidad_id" required>${opciones(unidades, null, { texto: 'identificador', vacio: 'Seleccione…' })}</select></label>
        <label>Identificador del subcontador<input name="identificador" placeholder="Ej. número del medidor" required></label>
        <label>Lectura inicial<input name="lectura_inicial" data-numero inputmode="decimal" value="0" required></label>
        <button type="submit">Guardar</button>
      </form>`);
    alEnviar(m.el.querySelector('form'), async (d) => { await S.crearSubcontador({ ...d, servicio_id: b.dataset.subcontador }); m.cerrar(); aviso('Subcontador agregado.'); recargar(); });
  });

  el.querySelectorAll('[data-factura]').forEach((b) => b.onclick = () => {
    const s = servicios.find((x) => x.id === b.dataset.factura);
    const f = facturas.find((x) => x.servicio_id === s.id) ?? {};
    const m = modal(`Factura de ${s.nombre} – ${nombrePeriodo(estado.periodo)}`, `
      <form>
        <label>Valor total de la factura (pesos)<input name="valor" data-numero inputmode="numeric" value="${f.valor ?? ''}" required></label>
        ${s.modalidad === 'compartido' ? `<label>Consumo del medidor principal (${esc(s.medida)})<input name="consumo_principal" data-numero inputmode="decimal" value="${f.consumo_principal ?? ''}" required>
          <span class="ayuda">Aparece en la factura de la empresa.</span></label>` : ''}
        <label>Fecha de vencimiento<input name="vencimiento" type="date" value="${f.vencimiento ?? ''}"></label>
        <label>Foto o PDF de la factura<input name="archivo" type="file" accept="image/*,application/pdf"></label>
        <button type="submit">Guardar factura</button>
      </form>`);
    const form = m.el.querySelector('form');
    alEnviar(form, async (d) => {
      await S.guardarFactura({ servicio_id: s.id, periodo: estado.periodo, valor: d.valor, consumo_principal: d.consumo_principal ?? null, vencimiento: d.vencimiento }, form.archivo.files[0] ?? null);
      m.cerrar(); aviso('Factura guardada.'); recargar();
    });
  });

  el.querySelectorAll('form[data-lecturas]').forEach((form) => {
    form.querySelectorAll('[name^=cambio_]').forEach((c) => c.onchange = () => {
      form.querySelector(`[data-inicial="${c.name.slice(7)}"]`).hidden = !c.checked;
    });
    alEnviar(form, async (d) => {
      const lista = lecturas[form.dataset.lecturas];
      let guardadas = 0;
      for (const l of lista) {
        const valor = d[`lectura_${l.subcontador_id}`];
        if (valor === null || valor === undefined) continue;
        const cambio = d[`cambio_${l.subcontador_id}`];
        if (valor === l.lectura && cambio === l.cambio_contador && (!cambio || d[`inicial_${l.subcontador_id}`] === l.lectura_inicial_nuevo)) continue;
        try {
          await S.guardarLectura({ subcontador_id: l.subcontador_id, periodo: estado.periodo, lectura: valor, cambio_contador: cambio, lectura_inicial_nuevo: d[`inicial_${l.subcontador_id}`] });
        } catch (e) { throw new Error(`${l.identificador} (${l.unidad}): ${e.message}`); }
        guardadas++;
      }
      aviso(guardadas ? `Lecturas guardadas (${guardadas}).` : 'No hay cambios.');
      recargar();
    });
  });

  el.querySelectorAll('[data-previa]').forEach((b) => b.onclick = async () => {
    try {
      const p = await conCarga(b, () => S.vistaPrevia(b.dataset.previa));
      mostrarPrevia(p, servicios.find((s) => s.id === p.factura.servicio_id), recargar);
    } catch (e) { error(e); }
  });

  el.querySelectorAll('[data-ver-archivo]').forEach((b) => b.onclick = async () => {
    try { window.open(await S.urlArchivo(b.dataset.verArchivo), '_blank'); } catch (e) { error(e); }
  });
}

function etiquetaEstado(s, f, ls) {
  if (!f) return '<span class="etiqueta alerta">Sin factura</span>';
  if (f.cerrada) return '<span class="etiqueta">Cerrado</span>';
  if (s.modalidad === 'compartido' && ls?.some((l) => l.lectura === null)) return '<span class="etiqueta alerta">Faltan lecturas</span>';
  return '<span class="etiqueta neutra">Listo para cerrar</span>';
}

function tarjetaServicio(s, f, ls) {
  const cerrada = f?.cerrada;
  return `
  <section class="tarjeta">
    <div class="tarjeta-cabecera">
      <div><h2>${esc(s.nombre)}${s.unidad ? ' – ' + esc(s.unidad) : ''}</h2>
        <div class="secundario">${esc([s.empresa, s.numero_cuenta && 'Cuenta ' + s.numero_cuenta].filter(Boolean).join(' · '))}
          ${s.modalidad === 'compartido' ? ` · Compartido por subcontador (${s.subcontadores})` : ' · Individual'}</div></div>
      ${etiquetaEstado(s, f, ls)}
    </div>
    ${f ? `<p>Factura: <strong class="monto">${formatoPesos(f.valor)}</strong>${f.consumo_principal ? ` · ${f.consumo_principal} ${esc(s.medida)}` : ''}${f.vencimiento ? ` · vence ${formatoFecha(f.vencimiento)}` : ''}
      ${f.archivo ? ` · <a href="#" data-ver-archivo="${esc(f.archivo)}" onclick="return false">ver factura</a>` : ''}
      ${cerrada && f.diferencia ? `<br><span class="secundario">Diferencia para el propietario: ${formatoPesos(f.diferencia)}</span>` : ''}</p>` : ''}
    ${s.modalidad === 'compartido' && ls ? formLecturas(s, ls, cerrada) : ''}
    <div class="acciones">
      ${cerrada ? '' : `<button type="button" class="boton-secundario boton-chico" data-factura="${s.id}">${f ? 'Editar factura' : 'Cargar factura'}</button>`}
      ${s.modalidad === 'compartido' && !cerrada ? `<button type="button" class="boton-secundario boton-chico" data-subcontador="${s.id}">+ Subcontador</button>` : ''}
      ${f ? `<button type="button" class="boton-chico" data-previa="${f.id}">${cerrada ? 'Ver reparto' : 'Revisar y cerrar'}</button>` : ''}
    </div>
  </section>`;
}

function formLecturas(s, ls, cerrada) {
  if (!ls.length) return '<p class="caja-alerta">Agregue los subcontadores de cada unidad conectada.</p>';
  return `
    <form data-lecturas="${s.id}" style="margin-bottom:.75rem">
      <div class="tabla-desplazable"><table>
        <thead><tr><th>Unidad</th><th class="num">Anterior</th><th class="num">Actual</th><th class="num">Consumo</th></tr></thead>
        <tbody>${ls.map((l) => `
          <tr><td>${esc(l.unidad)}<div class="secundario">${esc(l.identificador)}</div>
              ${cerrada ? '' : `<label class="casilla secundario"><input type="checkbox" name="cambio_${l.subcontador_id}" ${l.cambio_contador ? 'checked' : ''}> Cambio de contador</label>
              <label data-inicial="${l.subcontador_id}" ${l.cambio_contador ? '' : 'hidden'} class="secundario">Lectura inicial del nuevo
                <input name="inicial_${l.subcontador_id}" data-numero inputmode="decimal" value="${l.lectura_inicial_nuevo ?? ''}"></label>`}</td>
            <td class="num">${l.cambio_contador ? '—' : l.anterior}</td>
            <td class="num">${cerrada ? (l.lectura ?? '—') : `<input name="lectura_${l.subcontador_id}" data-numero inputmode="decimal" value="${l.lectura ?? ''}" style="width:6.5rem;text-align:right">`}</td>
            <td class="num">${l.consumo ?? '—'}</td></tr>`).join('')}</tbody>
      </table></div>
      ${cerrada ? '' : '<button type="submit" class="boton-chico">Guardar lecturas</button>'}
    </form>`;
}

function mostrarPrevia(p, s, recargar) {
  const cerrada = p.factura.cerrada;
  const m = modal(`${s.nombre} – ${nombrePeriodo(p.factura.periodo)}`, `
    ${p.alertas.map((a) => `<p class="${a.tipo === 'falta_lectura' ? 'caja-error' : 'caja-alerta'}">${esc(a.mensaje)}</p>`).join('')}
    <table>
      <thead><tr><th>Unidad</th>${s.modalidad === 'compartido' ? `<th class="num">Consumo</th>` : ''}<th class="num">Valor</th></tr></thead>
      <tbody>${p.filas.map((f) => `<tr><td>${esc(f.unidad)}${f.cobrable ? '' : ' <span class="etiqueta neutra">desocupada</span>'}</td>
        ${s.modalidad === 'compartido' ? `<td class="num">${f.consumo ?? '—'} ${esc(s.medida)}</td>` : ''}<td class="num">${f.valor === null ? '—' : formatoPesos(f.valor)}</td></tr>`).join('')}</tbody>
    </table>
    <p>Factura: <strong>${formatoPesos(p.factura.valor)}</strong><br>
      Se cobra a inquilinos: <strong>${formatoPesos(p.factura.valor - p.diferencia)}</strong><br>
      Diferencia para el propietario (áreas comunes, pérdidas, desocupadas): <strong>${formatoPesos(p.diferencia)}</strong></p>
    ${cerrada ? '<p class="secundario">Este servicio ya está cerrado.</p>' : '<button type="button" id="cerrar-servicio">Cerrar servicio</button><p class="ayuda">Al cerrarlo ya no se pueden cambiar la factura ni las lecturas, y queda listo para los cobros.</p>'}`);
  const b = m.el.querySelector('#cerrar-servicio');
  if (b) b.onclick = async () => {
    if (!confirmar('¿Cerrar el servicio con estos valores?')) return;
    try { await conCarga(b, () => S.cerrarServicio(p.factura.id)); m.cerrar(); aviso('Servicio cerrado.'); recargar(); } catch (e) { error(e); }
  };
}
