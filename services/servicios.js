import { db, q, rpc } from '../lib/cliente.js';

export function listarServicios(propiedadId = null) {
  let c = db().from('v_servicios').select('*');
  if (propiedadId) c = c.eq('propiedad_id', propiedadId);
  return q(c.order('propiedad').order('nombre'));
}

export function crearServicio({ propiedad_id, tipo, empresa = null, numero_cuenta = null, modalidad, medida = null, unidad_id = null }) {
  if (!tipo) throw new Error('Seleccione el tipo de servicio.');
  if (modalidad === 'individual' && !unidad_id) throw new Error('Un servicio individual necesita la unidad a la que pertenece.');
  if (modalidad === 'compartido' && !medida) throw new Error('Indique la unidad de medida (kWh o m³).');
  const datos = { propiedad_id, tipo, empresa, numero_cuenta, modalidad, medida, unidad_id: modalidad === 'individual' ? unidad_id : null };
  return q(db().from('servicios').insert(datos).select().single());
}

export function crearSubcontador({ servicio_id, unidad_id, identificador, lectura_inicial = 0 }) {
  if (!unidad_id) throw new Error('Seleccione la unidad.');
  if (!identificador) throw new Error('Escriba el identificador del subcontador.');
  return q(db().from('subcontadores').insert({ servicio_id, unidad_id, identificador, lectura_inicial: lectura_inicial ?? 0 }).select().single());
}

export const listarFacturas = (periodo) =>
  q(db().from('facturas_servicio').select('*').eq('periodo', periodo));

// Crea o actualiza la factura del servicio en el periodo. Si llega un archivo, lo sube y guarda la ruta.
export async function guardarFactura({ servicio_id, periodo, valor, consumo_principal = null, vencimiento = null }, archivo = null) {
  if (valor === null || valor === undefined || Number.isNaN(valor) || valor < 0) throw new Error('Escriba el valor de la factura.');
  const datos = { valor, consumo_principal, vencimiento };
  const existente = await q(db().from('facturas_servicio').select('id, cerrada').eq('servicio_id', servicio_id).eq('periodo', periodo).maybeSingle());
  if (existente?.cerrada) throw new Error('El servicio de este periodo ya está cerrado.');
  let factura = existente
    ? await q(db().from('facturas_servicio').update(datos).eq('id', existente.id).select().single())
    : await q(db().from('facturas_servicio').insert({ servicio_id, periodo, ...datos }).select().single());
  if (archivo) {
    const ruta = `facturas/${factura.id}/${Date.now()}-${archivo.name.replace(/[^\w.-]/g, '_')}`;
    await q(db().storage.from('soportes').upload(ruta, archivo));
    factura = await q(db().from('facturas_servicio').update({ archivo: ruta }).eq('id', factura.id).select().single());
  }
  return factura;
}

export const lecturasDelPeriodo = (servicioId, periodo) =>
  rpc('lecturas_del_periodo', { p_servicio: servicioId, p_periodo: periodo });

export async function guardarLectura({ subcontador_id, periodo, lectura, cambio_contador = false, lectura_inicial_nuevo = null }) {
  if (lectura === null || lectura === undefined || Number.isNaN(lectura)) throw new Error('Escriba la lectura.');
  const datos = { lectura, cambio_contador, lectura_inicial_nuevo: cambio_contador ? lectura_inicial_nuevo : null };
  const existente = await q(db().from('lecturas').select('id').eq('subcontador_id', subcontador_id).eq('periodo', periodo).maybeSingle());
  return existente
    ? q(db().from('lecturas').update(datos).eq('id', existente.id).select().single())
    : q(db().from('lecturas').insert({ subcontador_id, periodo, ...datos }).select().single());
}

// Cálculo sin guardar: filas por unidad, diferencia para el propietario y alertas.
export async function vistaPrevia(facturaId) {
  const [calculo, alertas, factura] = await Promise.all([
    rpc('calcular_servicio', { p_factura: facturaId }),
    rpc('alertas_servicio', { p_factura: facturaId }),
    q(db().from('facturas_servicio').select('*').eq('id', facturaId).single()),
  ]);
  const unidades = await q(db().from('unidades').select('id, identificador').in('id', calculo.map((c) => c.unidad_id)));
  const nombre = Object.fromEntries(unidades.map((u) => [u.id, u.identificador]));
  const filas = calculo.map((c) => ({ ...c, unidad: nombre[c.unidad_id], cobrable: c.contrato_id !== null }));
  const cobrado = filas.filter((f) => f.cobrable).reduce((s, f) => s + (f.valor ?? 0), 0);
  return { filas, alertas, factura, diferencia: factura.valor - cobrado };
}

export const cerrarServicio = (facturaId) => rpc('cerrar_servicio', { p_factura: facturaId });

export async function urlArchivo(ruta) {
  const r = await q(db().storage.from('soportes').createSignedUrl(ruta, 3600));
  return r.signedUrl;
}
