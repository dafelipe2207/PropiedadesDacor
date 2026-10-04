-- 003: Cobros mensuales — arriendo (proporcional base 30) + servicios cerrados.

create table cobros (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id),
  periodo text not null check (periodo_valido(periodo)),
  fecha_limite date not null,
  total bigint not null default 0,
  saldo bigint not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'parcial', 'pagado')),
  creado_en timestamptz not null default now(),
  unique (contrato_id, periodo)
);

create table lineas_cobro (
  id uuid primary key default gen_random_uuid(),
  cobro_id uuid not null references cobros(id) on delete cascade,
  concepto text not null check (concepto in ('arriendo', 'servicio')),
  factura_id uuid references facturas_servicio(id),
  descripcion text not null,
  valor bigint not null check (valor >= 0),
  unique nulls not distinct (cobro_id, concepto, factura_id)
);

-- Arriendo del periodo con base de 30 días: el día 31 cuenta como 30 y llegar a fin de mes cuenta hasta el día 30.
create function arriendo_proporcional(p_canon bigint, p_inicio date, p_fin date, p_periodo text)
returns bigint language plpgsql immutable as $$
declare
  v_ini date := greatest(p_inicio, periodo_inicio(p_periodo));
  v_fin date := least(coalesce(p_fin, 'infinity'::date), periodo_fin(p_periodo));
  d_ini int;
  d_fin int;
  v_dias int;
begin
  if v_ini > v_fin then return 0; end if;
  d_ini := least(extract(day from v_ini)::int, 30);
  d_fin := case when v_fin = periodo_fin(p_periodo) then 30 else least(extract(day from v_fin)::int, 30) end;
  v_dias := d_fin - d_ini + 1;
  if v_dias >= 30 then return p_canon; end if;
  return round(p_canon::numeric * v_dias / 30)::bigint;
end $$;

create function nombre_servicio(p_tipo text) returns text language sql immutable as $$
  select case p_tipo when 'agua' then 'Agua' when 'energia' then 'Energía' when 'gas' then 'Gas'
                     when 'internet' then 'Internet' else 'Otro servicio' end
$$;

-- Recalcula total, saldo y estado de un cobro. La versión de 004 descuenta los pagos aplicados.
create function recalcular_cobro(p_cobro uuid) returns void language plpgsql as $$
begin
  update cobros k set total = coalesce((select sum(valor) from lineas_cobro where cobro_id = k.id), 0)
  where k.id = p_cobro;
  update cobros set saldo = total,
    estado = case when total = 0 then 'pagado' else 'pendiente' end
  where id = p_cobro;
end $$;

-- Genera o completa los cobros del periodo. Devuelve cuántas líneas nuevas agregó. Idempotente.
create function generar_cobros(p_periodo text) returns int language plpgsql as $$
declare
  c record;
  v_cobro uuid;
  v_nuevas int := 0;
  v_n int;
begin
  if p_periodo is null or not periodo_valido(p_periodo) then
    raise exception 'Periodo inválido: %. Use el formato AAAA-MM', p_periodo;
  end if;

  for c in
    select k.*, u.identificador from contratos k join unidades u on u.id = k.unidad_id
    where k.fecha_inicio <= periodo_fin(p_periodo)
      and coalesce(k.fecha_fin, 'infinity'::date) >= periodo_inicio(p_periodo)
  loop
    insert into cobros(contrato_id, periodo, fecha_limite)
      values (c.id, p_periodo, periodo_inicio(p_periodo) + (c.dia_pago - 1))
      on conflict (contrato_id, periodo) do nothing;
    select id into v_cobro from cobros where contrato_id = c.id and periodo = p_periodo;

    insert into lineas_cobro(cobro_id, concepto, descripcion, valor)
      values (v_cobro, 'arriendo', 'Arriendo ' || c.identificador,
              arriendo_proporcional(c.canon, c.fecha_inicio, c.fecha_fin, p_periodo))
      on conflict do nothing;
    get diagnostics v_n = row_count;
    v_nuevas := v_nuevas + v_n;

    insert into lineas_cobro(cobro_id, concepto, factura_id, descripcion, valor)
      select v_cobro, 'servicio', f.id,
             nombre_servicio(s.tipo) || ' – ' || c.identificador
               || coalesce(' – ' || trim(to_char(d.consumo, 'FM999999990.##')) || ' ' || s.medida, ''),
             d.valor
      from distribucion_servicio d
      join facturas_servicio f on f.id = d.factura_id
      join servicios s on s.id = f.servicio_id
      where d.contrato_id = c.id and f.periodo = p_periodo and f.cerrada
      on conflict do nothing;
    get diagnostics v_n = row_count;
    v_nuevas := v_nuevas + v_n;

    perform recalcular_cobro(v_cobro);
  end loop;

  return v_nuevas;
end $$;
