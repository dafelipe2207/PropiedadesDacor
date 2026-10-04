// Formatos colombianos: pesos sin decimales, fechas dd/mm/aaaa, periodos 'AAAA-MM'.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function formatoPesos(n) {
  const valor = Math.round(Number(n) || 0);
  const digitos = String(Math.abs(valor)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (valor < 0 ? '-$' : '$') + digitos;
}

export function formatoFecha(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function nombrePeriodo(periodo) {
  const [a, m] = periodo.split('-');
  return `${MESES[Number(m) - 1]} de ${a}`;
}

// Fecha 'AAAA-MM-DD' de hoy en Bogotá.
export function hoyBogota(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(fecha);
}

export function periodoActual(fecha = new Date()) {
  return hoyBogota(fecha).slice(0, 7);
}

export function periodoSiguiente(periodo, meses = 1) {
  const [a, m] = periodo.split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// Escapa texto para insertarlo en HTML.
export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const TIPOS_UNIDAD = { apartamento: 'Apartamento', apartaestudio: 'Apartaestudio', local: 'Local' };
export const TIPOS_SERVICIO = { agua: 'Agua', energia: 'Energía', gas: 'Gas', internet: 'Internet', otro: 'Otro' };

// Convierte lo que escribe el usuario en número.
// 'entero' (pesos): los puntos son de miles; no se aceptan centavos.
// 'decimal' (lecturas): la coma es decimal; el punto es de miles solo si va seguido de grupos de 3 dígitos.
export function leerNumero(texto, modo = 'entero') {
  let t = String(texto ?? '').trim().replace(/\s/g, '');
  if (t === '') return null;
  if (modo === 'entero') {
    if (!/^-?[\d.]+$/.test(t)) return NaN;
    return Number(t.replace(/\./g, ''));
  }
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

// Muestra un número guardado en un campo de texto con coma decimal (ida y vuelta segura con leerNumero).
export const numeroEnCampo = (x) => (x === null || x === undefined ? '' : String(x).replace('.', ','));
