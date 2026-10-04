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

alter table perfiles add column nombre text;

-- Nombre para mostrar de un usuario (visible para todos los roles, solo el nombre).
create function nombre_usuario(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nombre from perfiles where id = p_id),
                  case (select rol from perfiles where id = p_id) when 'admin' then 'Administrador' else 'Usuario' end)
$$;

create view v_cobros with (security_invoker = true) as
select k.id, k.contrato_id, k.periodo, k.fecha_limite, k.total, k.saldo, k.estado,
       c.inquilino_id, i.nombre as inquilino, i.telefono,
       u.identificador as unidad, u.tipo as tipo_unidad, u.propiedad_id, p.nombre as propiedad, p.propietario_id
from cobros k
join contratos c on c.id = k.contrato_id
join inquilinos i on i.id = c.inquilino_id
join unidades u on u.id = c.unidad_id
join propiedades p on p.id = u.propiedad_id;

create view v_pagos with (security_invoker = true) as
select pg.id, pg.numero, pg.contrato_id, pg.fecha, pg.valor, pg.estado, pg.motivo_anulacion, pg.anulado_en, pg.detalle,
       pg.recibido_por, nombre_usuario(pg.recibido_por) as recibido_por_nombre, pg.creado_en,
       c.inquilino_id, i.nombre as inquilino, i.telefono,
       u.identificador as unidad, u.propiedad_id, p.nombre as propiedad, p.propietario_id
from pagos pg
join contratos c on c.id = pg.contrato_id
join inquilinos i on i.id = c.inquilino_id
join unidades u on u.id = c.unidad_id
join propiedades p on p.id = u.propiedad_id;

grant select on v_cobros, v_pagos to authenticated;

create view v_entregas with (security_invoker = true) as
select e.id, e.propietario_id, pr.nombre as propietario, pr.telefono, e.fecha, e.valor, e.estado, e.comentario,
       e.respondida_en, e.creado_en, nombre_usuario(e.registrada_por) as registrada_por_nombre,
       (select count(*) from entrega_pagos ep where ep.entrega_id = e.id) as recibos
from entregas e
join propietarios pr on pr.id = e.propietario_id;

grant select on v_entregas to authenticated;

-- Detalle de un servicio cobrado (lecturas, consumo, valor y tarifa) para quien puede ver el contrato.
create function detalle_servicio_cobrado(p_factura uuid)
returns table (unidad text, subcontador text, anterior numeric, lectura numeric, consumo numeric, valor bigint, tarifa numeric)
language sql stable security definer set search_path = public as $$
  select u.identificador, sc.identificador,
         case when l.cambio_contador then l.lectura_inicial_nuevo else lectura_anterior(sc.id, f.periodo) end,
         l.lectura, d.consumo, d.valor,
         case when f.consumo_principal > 0 then round(f.valor::numeric / f.consumo_principal, 2) end
  from distribucion_servicio d
  join facturas_servicio f on f.id = d.factura_id
  join unidades u on u.id = d.unidad_id
  left join subcontadores sc on sc.servicio_id = f.servicio_id and sc.unidad_id = d.unidad_id
  left join lecturas l on l.subcontador_id = sc.id and l.periodo = f.periodo
  where d.factura_id = p_factura and d.contrato_id is not null and contrato_visible(d.contrato_id)
  order by u.identificador
$$;
