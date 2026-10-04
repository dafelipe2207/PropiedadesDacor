-- 009: Vistas que usan las pantallas (datos ya unidos). security_invoker = true: respetan RLS.

create view v_unidades with (security_invoker = true) as
select u.id, u.propiedad_id, p.nombre as propiedad, u.tipo, u.identificador, u.canon, u.estado,
       c.id as contrato_id, i.nombre as inquilino
from unidades u
join propiedades p on p.id = u.propiedad_id
left join contratos c on c.unidad_id = u.id and c.estado = 'activo'
left join inquilinos i on i.id = c.inquilino_id;

create view v_contratos with (security_invoker = true) as
select c.id, c.unidad_id, u.identificador as unidad, u.tipo as tipo_unidad,
       u.propiedad_id, p.nombre as propiedad, p.propietario_id,
       c.inquilino_id, i.nombre as inquilino, i.telefono,
       c.fecha_inicio, c.fecha_fin, c.canon, c.dia_pago, c.estado
from contratos c
join unidades u on u.id = c.unidad_id
join propiedades p on p.id = u.propiedad_id
join inquilinos i on i.id = c.inquilino_id;

grant select on v_unidades, v_contratos to authenticated;

create view v_servicios with (security_invoker = true) as
select s.id, s.propiedad_id, p.nombre as propiedad, s.tipo, nombre_servicio(s.tipo) as nombre,
       s.empresa, s.numero_cuenta, s.modalidad, s.medida, s.unidad_id, u.identificador as unidad, s.activo,
       (select count(*) from subcontadores sc where sc.servicio_id = s.id) as subcontadores
from servicios s
join propiedades p on p.id = s.propiedad_id
left join unidades u on u.id = s.unidad_id;

-- Lecturas de un servicio compartido en un periodo, con la lectura anterior y el consumo.
create function lecturas_del_periodo(p_servicio uuid, p_periodo text)
returns table (subcontador_id uuid, identificador text, unidad text, anterior numeric, lectura numeric,
               consumo numeric, cambio_contador boolean, lectura_inicial_nuevo numeric, lectura_id uuid)
language sql stable as $$
  select sc.id, sc.identificador, u.identificador,
         lectura_anterior(sc.id, p_periodo),
         l.lectura,
         l.lectura - case when l.cambio_contador then l.lectura_inicial_nuevo else lectura_anterior(sc.id, p_periodo) end,
         coalesce(l.cambio_contador, false), l.lectura_inicial_nuevo, l.id
  from subcontadores sc
  join unidades u on u.id = sc.unidad_id
  left join lecturas l on l.subcontador_id = sc.id and l.periodo = p_periodo
  where sc.servicio_id = p_servicio
  order by sc.identificador
$$;

grant select on v_servicios to authenticated;
