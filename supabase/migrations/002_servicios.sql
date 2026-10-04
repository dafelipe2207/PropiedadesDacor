-- 002: Servicios públicos — individuales y compartidos por subcontador.

create function periodo_valido(p text) returns boolean language sql immutable as $$
  select p ~ '^\d{4}-(0[1-9]|1[0-2])$'
$$;

create function periodo_inicio(p text) returns date language sql immutable as $$
  select to_date(p || '-01', 'YYYY-MM-DD')
$$;

create function periodo_fin(p text) returns date language sql immutable as $$
  select (to_date(p || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date
$$;

-- Contrato de la unidad que cubre el periodo; si hubo cambio de inquilino en el mes, el más reciente.
create function contrato_en_periodo(p_unidad uuid, p_periodo text) returns uuid language sql stable as $$
  select id from contratos
  where unidad_id = p_unidad
    and fecha_inicio <= periodo_fin(p_periodo)
    and coalesce(fecha_fin, 'infinity'::date) >= periodo_inicio(p_periodo)
  order by fecha_inicio desc
  limit 1
$$;

create table servicios (
  id uuid primary key default gen_random_uuid(),
  propiedad_id uuid not null references propiedades(id),
  tipo text not null check (tipo in ('agua', 'energia', 'gas', 'internet', 'otro')),
  empresa text,
  numero_cuenta text,
  modalidad text not null check (modalidad in ('individual', 'compartido')),
  medida text check (medida in ('kWh', 'm³')),
  unidad_id uuid references unidades(id),
  activo boolean not null default true,
  check ((modalidad = 'individual') = (unidad_id is not null))
);

create table subcontadores (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references servicios(id),
  unidad_id uuid not null references unidades(id),
  identificador text not null,
  lectura_inicial numeric not null default 0 check (lectura_inicial >= 0),
  unique (servicio_id, unidad_id)
);

create table facturas_servicio (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references servicios(id),
  periodo text not null check (periodo_valido(periodo)),
  valor bigint not null check (valor >= 0),
  consumo_principal numeric check (consumo_principal > 0),
  vencimiento date,
  archivo text,
  cerrada boolean not null default false,
  diferencia bigint,
  unique (servicio_id, periodo)
);

create table lecturas (
  id uuid primary key default gen_random_uuid(),
  subcontador_id uuid not null references subcontadores(id),
  periodo text not null check (periodo_valido(periodo)),
  lectura numeric not null check (lectura >= 0),
  cambio_contador boolean not null default false,
  lectura_inicial_nuevo numeric check (lectura_inicial_nuevo >= 0),
  foto text,
  unique (subcontador_id, periodo),
  check (not cambio_contador or lectura_inicial_nuevo is not null)
);

create table distribucion_servicio (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references facturas_servicio(id) on delete cascade,
  unidad_id uuid not null references unidades(id),
  contrato_id uuid references contratos(id),
  consumo numeric,
  valor bigint not null
);

-- Lectura de referencia (la anterior) para un subcontador en un periodo.
create function lectura_anterior(p_sub uuid, p_periodo text) returns numeric language sql stable as $$
  select coalesce(
    (select l.lectura from lecturas l where l.subcontador_id = p_sub and l.periodo < p_periodo
      order by l.periodo desc limit 1),
    (select lectura_inicial from subcontadores where id = p_sub))
$$;

create function lecturas_validar() returns trigger language plpgsql as $$
declare
  v_anterior numeric;
begin
  if new.cambio_contador then
    if new.lectura < new.lectura_inicial_nuevo then
      raise exception 'La lectura es menor que la lectura inicial del contador nuevo';
    end if;
    return new;
  end if;
  v_anterior := lectura_anterior(new.subcontador_id, new.periodo);
  if new.lectura < v_anterior then
    raise exception 'La lectura es menor que la anterior (%). Si cambiaron el contador, márquelo como cambio de contador.', v_anterior;
  end if;
  if exists (select 1 from facturas_servicio f join subcontadores s on s.servicio_id = f.servicio_id
             where s.id = new.subcontador_id and f.periodo = new.periodo and f.cerrada) then
    raise exception 'El servicio de este periodo ya está cerrado';
  end if;
  return new;
end $$;

create trigger lecturas_validar before insert or update on lecturas
  for each row execute function lecturas_validar();

-- Calcula (sin guardar) cuánto le corresponde a cada unidad.
create function calcular_servicio(p_factura uuid)
returns table (unidad_id uuid, contrato_id uuid, consumo numeric, valor bigint)
language plpgsql stable as $$
declare
  f facturas_servicio;
  s servicios;
  v_tarifa numeric;
begin
  select * into f from facturas_servicio where id = p_factura;
  if not found then raise exception 'Factura no encontrada'; end if;
  select * into s from servicios where id = f.servicio_id;

  if s.modalidad = 'individual' then
    return query select s.unidad_id, contrato_en_periodo(s.unidad_id, f.periodo), null::numeric, f.valor;
    return;
  end if;

  if f.consumo_principal is null then
    raise exception 'Indique el consumo del medidor principal de la factura';
  end if;
  v_tarifa := f.valor::numeric / f.consumo_principal;

  return query
    select sc.unidad_id,
           contrato_en_periodo(sc.unidad_id, f.periodo),
           c.consumo,
           round(c.consumo * v_tarifa)::bigint
    from subcontadores sc
    left join lateral (
      select l.lectura - case when l.cambio_contador then l.lectura_inicial_nuevo
                              else lectura_anterior(sc.id, f.periodo) end as consumo
      from lecturas l where l.subcontador_id = sc.id and l.periodo = f.periodo
    ) c on true
    where sc.servicio_id = s.id
    order by sc.identificador;
end $$;

create function alertas_servicio(p_factura uuid)
returns table (tipo text, mensaje text) language plpgsql stable as $$
declare
  f facturas_servicio;
  v_faltan text;
  v_suma numeric;
begin
  select * into f from facturas_servicio where id = p_factura;
  if (select modalidad from servicios where id = f.servicio_id) = 'individual' then return; end if;

  select string_agg(sc.identificador, ', ' order by sc.identificador) into v_faltan
  from subcontadores sc
  where sc.servicio_id = f.servicio_id
    and not exists (select 1 from lecturas l where l.subcontador_id = sc.id and l.periodo = f.periodo);
  if v_faltan is not null then
    tipo := 'falta_lectura'; mensaje := 'Falta la lectura de: ' || v_faltan; return next;
  end if;

  select sum(c.consumo) into v_suma from calcular_servicio(p_factura) c;
  if f.consumo_principal is not null and v_suma > f.consumo_principal then
    tipo := 'suma_mayor_principal';
    mensaje := format('Los subcontadores suman %s y el medidor principal marca %s', v_suma, f.consumo_principal);
    return next;
  end if;
end $$;

create function cerrar_servicio(p_factura uuid) returns void language plpgsql as $$
declare
  f facturas_servicio;
  v_alerta text;
begin
  select * into f from facturas_servicio where id = p_factura for update;
  if f.cerrada then raise exception 'El servicio de este periodo ya está cerrado'; end if;
  select a.mensaje into v_alerta from alertas_servicio(p_factura) a where a.tipo = 'falta_lectura';
  if v_alerta is not null then raise exception '%', v_alerta; end if;

  insert into distribucion_servicio(factura_id, unidad_id, contrato_id, consumo, valor)
    select p_factura, c.unidad_id, c.contrato_id, c.consumo, c.valor from calcular_servicio(p_factura) c;

  update facturas_servicio set cerrada = true,
    diferencia = f.valor - coalesce((select sum(d.valor) from distribucion_servicio d
                                     where d.factura_id = p_factura and d.contrato_id is not null), 0)
  where id = p_factura;
end $$;
