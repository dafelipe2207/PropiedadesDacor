// Utilidades de interfaz: avisos, modales, formularios y botones con estado de carga.
import { esc, leerNumero } from './formato.js';

export function aviso(mensaje, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.setAttribute('role', 'status');
  el.textContent = mensaje;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), tipo === 'error' ? 6000 : 3000);
}

export function error(e) {
  console.error(e);
  aviso(e?.message || String(e), 'error');
}

// Abre un modal. Devuelve { el, cerrar }. contenido es HTML ya escapado.
export function modal(titulo, contenido) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <header class="modal-cabecera"><h2>${esc(titulo)}</h2>
        <button type="button" class="boton-icono" data-cerrar aria-label="Cerrar">✕</button></header>
      <div class="modal-cuerpo">${contenido}</div>
    </div>`;
  const cerrar = () => fondo.remove();
  fondo.addEventListener('click', (ev) => {
    if (ev.target === fondo || ev.target.closest('[data-cerrar]')) cerrar();
  });
  document.body.appendChild(fondo);
  fondo.querySelector('input, select, textarea')?.focus();
  return { el: fondo, cerrar };
}

export function confirmar(mensaje) {
  return window.confirm(mensaje);
}

// Lee un formulario como objeto; los campos con data-numero se convierten a número.
export function datosFormulario(form) {
  const datos = {};
  for (const campo of form.elements) {
    if (!campo.name) continue;
    if (campo.type === 'checkbox') { datos[campo.name] = campo.checked; continue; }
    let v = campo.value.trim();
    if (campo.dataset.numero !== undefined) {
      v = leerNumero(v, campo.dataset.numero || 'entero');
      if (Number.isNaN(v)) {
        const nombre = campo.closest('label')?.firstChild?.textContent?.trim() || campo.name;
        throw new Error(`Revise el número en «${nombre}».${campo.dataset.numero === 'decimal' ? '' : ' Escriba pesos sin centavos.'}`);
      }
    } else if (v === '') v = null;
    datos[campo.name] = v;
  }
  return datos;
}

// Ejecuta fn deshabilitando el botón mientras espera; evita doble envío.
export async function conCarga(boton, fn) {
  if (boton.disabled) return;
  const texto = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    return await fn();
  } finally {
    boton.disabled = false;
    boton.textContent = texto;
  }
}

// Envía un formulario con manejo de errores y carga.
export function alEnviar(form, fn) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const boton = form.querySelector('[type=submit]');
    try {
      await conCarga(boton, async () => fn(datosFormulario(form)));
    } catch (e) {
      error(e);
    }
  });
}

export function opciones(lista, valorSel, { valor = 'id', texto = 'nombre', vacio = null } = {}) {
  const items = lista.map((x) => {
    const v = typeof valor === 'function' ? valor(x) : x[valor];
    const t = typeof texto === 'function' ? texto(x) : x[texto];
    return `<option value="${esc(v)}" ${String(v) === String(valorSel ?? '') ? 'selected' : ''}>${esc(t)}</option>`;
  });
  return (vacio !== null ? `<option value="">${esc(vacio)}</option>` : '') + items.join('');
}

export function vacio(mensaje) {
  return `<p class="vacio">${esc(mensaje)}</p>`;
}

// Abre una URL que se obtiene de forma asíncrona sin que el bloqueador de ventanas (iPhone) la descarte:
// la pestaña se abre en el mismo toque y luego se le asigna la dirección.
export async function abrirEnPestana(obtenerUrl) {
  const ventana = window.open('', '_blank');
  try {
    const url = await obtenerUrl();
    if (ventana) ventana.location.href = url; else window.location.href = url;
  } catch (e) {
    ventana?.close();
    throw e;
  }
}
