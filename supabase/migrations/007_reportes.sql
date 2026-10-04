-- 007: Vistas de reportes. security_invoker = true para que cada rol vea solo lo suyo (RLS).

create function hoy_bogota() returns date language sql stable as $$
  select (now() at time zone 'America/Bogota')::date
$$;

create view v_recaudo_mensual with (security_invoker = true) as
select k.periodo,
       u.propiedad_id,
       u.tipo as tipo_unidad,
       coalesce(sum(l.arriendo), 0)::bigint as cobrado_arriendo,
       coalesce(sum(l.servicios), 0)::bigint as cobrado_servicios,
       coalesce(sum(a.recaudado), 0)::bigint as recaudado
from cobros k
join contratos c on c.id = k.contrato_id
join unidades u on u.id = c.unidad_id
left join lateral (
  select sum(valor) filter (where concepto = 'arriendo') as arriendo,
         sum(valor) filter (where concepto = 'servicio') as servicios
  from lineas_cobro where cobro_id = k.id) l on true
left join lateral (select sum(valor) as recaudado from aplicacion_pagos where cobro_id = k.id) a on true
group by k.periodo, u.propiedad_id, u.tipo;

create view v_cartera with (security_invoker = true) as
select k.id as cobro_id,
       k.contrato_id,
       i.nombre as inquilino,
       i.telefono,
       u.identificador as unidad,
       u.propiedad_id,
       k.periodo,
       k.fecha_limite,
       k.saldo,
       (hoy_bogota() - k.fecha_limite) as dias_mora
from cobros k
join contratos c on c.id = k.contrato_id
join inquilinos i on i.id = c.inquilino_id
join unidades u on u.id = c.unidad_id
where k.saldo > 0 and k.fecha_limite < hoy_bogota();

create view v_caja_admin with (security_invoker = true) as
select pr.propietario_id,
       p.id as pago_id,
       p.numero,
       p.fecha,
       p.valor,
       u.identificador as unidad,
       i.nombre as inquilino
from pagos p
join contratos c on c.id = p.contrato_id
join unidades u on u.id = c.unidad_id
join propiedades pr on pr.id = u.propiedad_id
join inquilinos i on i.id = c.inquilino_id
where p.estado = 'vigente'
  and not exists (select 1 from entrega_pagos ep join entregas e on e.id = ep.entrega_id
                  where ep.pago_id = p.id and e.estado <> 'rechazada');

create view v_diferencia_servicios with (security_invoker = true) as
select s.propiedad_id,
       f.periodo,
       nombre_servicio(s.tipo) as servicio,
       f.diferencia
from facturas_servicio f
join servicios s on s.id = f.servicio_id
where f.cerrada and s.modalidad = 'compartido';

create view v_ocupacion with (security_invoker = true) as
select propiedad_id,
       count(*) filter (where estado <> 'inactiva') as total,
       count(*) filter (where estado = 'ocupada') as ocupadas
from unidades
group by propiedad_id;

grant select on v_recaudo_mensual, v_cartera, v_caja_admin, v_diferencia_servicios, v_ocupacion to authenticated;
