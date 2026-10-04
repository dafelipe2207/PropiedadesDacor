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
