// Inicio del administrador: resumen rápido y accesos directos. Se completa con reportes en la tarea 12.
import { listarUnidades } from '../../services/propiedades.js';
import { esc } from '../../lib/formato.js';

export async function render(el) {
  const unidades = await listarUnidades();
  const ocupadas = unidades.filter((u) => u.estado === 'ocupada').length;
  el.innerHTML = `
    <h1>Inicio</h1>
    <div class="cifras">
      <div class="cifra"><span>Unidades</span><strong>${unidades.length}</strong></div>
      <div class="cifra"><span>Ocupadas</span><strong>${ocupadas}</strong></div>
      <div class="cifra"><span>Disponibles</span><strong>${unidades.filter((u) => u.estado === 'disponible').length}</strong></div>
    </div>
    ${unidades.length ? '' : `<p class="vacio">${esc('Empiece registrando propietarios e inquilinos en Personas, luego sus propiedades.')}</p>`}`;
}
