-- 005: Anulación de recibos y entregas de efectivo al propietario.

create table entregas (
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null references propietarios(id),
  fecha date not null,
  valor bigint not null check (valor > 0),
  estado text not null default 'pendiente_confirmar' check (estado in ('pendiente_confirmar', 'confirmada', 'rechazada')),
  comentario text,
  registrada_por uuid not null references auth.users(id),
  respondida_en timestamptz,
  creado_en timestamptz not null default now()
);

create table entrega_pagos (
  entrega_id uuid not null references entregas(id),
  pago_id uuid not null references pagos(id),
  primary key (entrega_id, pago_id)
);

create function propietario_de_pago(p_pago uuid) returns uuid language sql stable as $$
  select pr.propietario_id from pagos p
  join contratos c on c.id = p.contrato_id
  join unidades u on u.id = c.unidad_id
  join propiedades pr on pr.id = u.propiedad_id
  where p.id = p_pago
$$;

-- Estado de la entrega vigente (no rechazada) que contiene el pago, o null.
create function entrega_del_pago(p_pago uuid) returns text language sql stable as $$
  select e.estado from entrega_pagos ep join entregas e on e.id = ep.entrega_id
  where ep.pago_id = p_pago and e.estado <> 'rechazada'
  limit 1
$$;

create function anular_recibo(p_pago uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pago pagos;
  v_entrega text;
begin
  if not es_admin() then raise exception 'Solo el administrador puede anular recibos'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indique el motivo de la anulación'; end if;
  select * into v_pago from pagos where id = p_pago for update;
  if not found then raise exception 'Recibo no encontrado'; end if;
  if v_pago.estado = 'anulado' then raise exception 'El recibo ya está anulado'; end if;

  v_entrega := entrega_del_pago(p_pago);
  if v_entrega = 'confirmada' then
    raise exception 'No se puede anular: el recibo ya fue entregado y confirmado por el propietario';
  elsif v_entrega = 'pendiente_confirmar' then
    raise exception 'El recibo está en una entrega pendiente de confirmar por el propietario';
  end if;

  update pagos set estado = 'anulado', motivo_anulacion = trim(p_motivo), anulado_en = now() where id = p_pago;
  perform reaplicar_pagos(v_pago.contrato_id);
end $$;

create function registrar_entrega(p_propietario uuid, p_fecha date, p_pagos uuid[])
returns entregas language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_pago pagos;
  v_total bigint := 0;
  v_entrega entregas;
begin
  if not es_admin() then raise exception 'Solo el administrador puede registrar entregas'; end if;
  if p_pagos is null or cardinality(p_pagos) = 0 then raise exception 'Seleccione al menos un recibo'; end if;

  foreach v_id in array p_pagos loop
    select * into v_pago from pagos where id = v_id for update;
    if not found then raise exception 'Recibo no encontrado'; end if;
    if v_pago.estado = 'anulado' then raise exception 'El recibo N.º % está anulado', v_pago.numero; end if;
    if propietario_de_pago(v_id) is distinct from p_propietario then
      raise exception 'El recibo N.º % no pertenece a este propietario', v_pago.numero;
    end if;
    if entrega_del_pago(v_id) is not null then
      raise exception 'El recibo N.º % ya está en otra entrega', v_pago.numero;
    end if;
    v_total := v_total + v_pago.valor;
  end loop;

  insert into entregas(propietario_id, fecha, valor, registrada_por)
    values (p_propietario, coalesce(p_fecha, (now() at time zone 'America/Bogota')::date), v_total, auth.uid())
    returning * into v_entrega;
  insert into entrega_pagos(entrega_id, pago_id) select v_entrega.id, x from unnest(p_pagos) as x;
  return v_entrega;
end $$;

create function responder_entrega(p_entrega uuid, p_confirmar boolean, p_comentario text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_entrega entregas;
begin
  select * into v_entrega from entregas where id = p_entrega for update;
  if not found or v_entrega.propietario_id is distinct from mi_propietario() then
    raise exception 'Solo el propietario de la entrega puede responderla';
  end if;
  if v_entrega.estado <> 'pendiente_confirmar' then raise exception 'La entrega ya fue respondida'; end if;
  if not p_confirmar and coalesce(trim(p_comentario), '') = '' then
    raise exception 'Escriba un comentario explicando por qué rechaza la entrega';
  end if;
  update entregas set estado = case when p_confirmar then 'confirmada' else 'rechazada' end,
    comentario = nullif(trim(p_comentario), ''), respondida_en = now()
  where id = p_entrega;
end $$;
