-- 006: Seguridad por rol (Row Level Security).
-- Admin: todo el catálogo; el dinero (pagos, entregas) solo cambia por funciones.
-- Inquilino: solo lo de sus contratos. Propietario: solo lo de sus propiedades.

-- Ayudantes (security definer: consultan sin RLS para evitar recursión).
create function propiedad_es_mia(p_propiedad uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from propiedades where id = p_propiedad and propietario_id = mi_propietario())
$$;

create function contrato_visible(p_contrato uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or exists (
    select 1 from contratos c join unidades u on u.id = c.unidad_id join propiedades p on p.id = u.propiedad_id
    where c.id = p_contrato
      and (c.inquilino_id = mi_inquilino() or p.propietario_id = mi_propietario()))
$$;

create function unidad_visible(p_unidad uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin()
    or exists (select 1 from unidades u where u.id = p_unidad and propiedad_es_mia(u.propiedad_id))
    or exists (select 1 from contratos c where c.unidad_id = p_unidad and c.inquilino_id = mi_inquilino())
$$;

create function propiedad_visible(p_propiedad uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or propiedad_es_mia(p_propiedad)
    or exists (select 1 from contratos c join unidades u on u.id = c.unidad_id
               where u.propiedad_id = p_propiedad and c.inquilino_id = mi_inquilino())
$$;

create function servicio_es_mio(p_servicio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from servicios s where s.id = p_servicio and propiedad_es_mia(s.propiedad_id))
$$;

-- Activar RLS en todas las tablas.
alter table perfiles enable row level security;
alter table propietarios enable row level security;
alter table propiedades enable row level security;
alter table unidades enable row level security;
alter table inquilinos enable row level security;
alter table contratos enable row level security;
alter table servicios enable row level security;
alter table subcontadores enable row level security;
alter table facturas_servicio enable row level security;
alter table lecturas enable row level security;
alter table distribucion_servicio enable row level security;
alter table cobros enable row level security;
alter table lineas_cobro enable row level security;
alter table consecutivos enable row level security;
alter table pagos enable row level security;
alter table aplicacion_pagos enable row level security;
alter table entregas enable row level security;
alter table entrega_pagos enable row level security;

-- Catálogo: el administrador gestiona todo.
create policy admin_todo on propietarios for all using (es_admin()) with check (es_admin());
create policy admin_todo on propiedades for all using (es_admin()) with check (es_admin());
create policy admin_todo on unidades for all using (es_admin()) with check (es_admin());
create policy admin_todo on inquilinos for all using (es_admin()) with check (es_admin());
create policy admin_todo on contratos for all using (es_admin()) with check (es_admin());
create policy admin_todo on servicios for all using (es_admin()) with check (es_admin());
create policy admin_todo on subcontadores for all using (es_admin()) with check (es_admin());
create policy admin_todo on facturas_servicio for all using (es_admin()) with check (es_admin());
create policy admin_todo on lecturas for all using (es_admin()) with check (es_admin());
create policy admin_todo on perfiles for all using (es_admin()) with check (es_admin());

-- Resultados de cálculos: el administrador los crea con las funciones (sin borrar).
create policy admin_insertar on distribucion_servicio for insert with check (es_admin());
create policy admin_insertar on cobros for insert with check (es_admin());
create policy admin_actualizar on cobros for update using (es_admin()) with check (es_admin());
create policy admin_insertar on lineas_cobro for insert with check (es_admin());

-- Lectura por rol.
create policy ver_propio on perfiles for select using (id = auth.uid());
create policy ver on propietarios for select using (id = mi_propietario());
create policy ver on propiedades for select using (propiedad_visible(id));
create policy ver on unidades for select using (unidad_visible(id));
create policy ver on contratos for select using (contrato_visible(id));
create policy ver on inquilinos for select using (
  id = mi_inquilino()
  or exists (select 1 from contratos c join unidades u on u.id = c.unidad_id
             where c.inquilino_id = inquilinos.id and propiedad_es_mia(u.propiedad_id)));
create policy ver on cobros for select using (contrato_visible(contrato_id));
create policy ver on lineas_cobro for select using (exists (select 1 from cobros c where c.id = cobro_id));
create policy ver on pagos for select using (contrato_visible(contrato_id));
create policy ver on aplicacion_pagos for select using (exists (select 1 from pagos p where p.id = pago_id));
create policy ver on consecutivos for select using (es_admin());
create policy ver on distribucion_servicio for select using (
  es_admin() or (contrato_id is not null and contrato_visible(contrato_id) and mi_inquilino() is not null)
  or exists (select 1 from facturas_servicio f where f.id = factura_id and servicio_es_mio(f.servicio_id)));
create policy ver on facturas_servicio for select using (
  servicio_es_mio(servicio_id)
  or exists (select 1 from lineas_cobro l where l.factura_id = facturas_servicio.id));
create policy ver on servicios for select using (
  propiedad_es_mia(propiedad_id)
  or exists (select 1 from facturas_servicio f where f.servicio_id = servicios.id));
create policy ver on subcontadores for select using (servicio_es_mio(servicio_id) or unidad_visible(unidad_id));
create policy ver on lecturas for select using (
  exists (select 1 from subcontadores sc where sc.id = subcontador_id and servicio_es_mio(sc.servicio_id))
  or exists (select 1 from subcontadores sc
             join distribucion_servicio d on d.unidad_id = sc.unidad_id
             join facturas_servicio f on f.id = d.factura_id and f.servicio_id = sc.servicio_id
             where sc.id = subcontador_id and f.periodo = lecturas.periodo));
create policy ver on entregas for select using (es_admin() or propietario_id = mi_propietario());
create policy ver on entrega_pagos for select using (exists (select 1 from entregas e where e.id = entrega_id));

-- Nada de dinero se borra ni se edita directamente.
revoke insert, update, delete on pagos, aplicacion_pagos, entregas, entrega_pagos, consecutivos from authenticated;
revoke delete on cobros, lineas_cobro, distribucion_servicio from authenticated;
revoke all on all tables in schema public from anon;
