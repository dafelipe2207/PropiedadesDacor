-- 004: Pagos en efectivo, recibos de caja consecutivos y aplicación FIFO a los cobros.

create table consecutivos (
  nombre text primary key,
  ultimo bigint not null default 0
);
insert into consecutivos(nombre, ultimo) values ('recibo', 0);

create table pagos (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique,
  contrato_id uuid not null references contratos(id),
  fecha date not null,
  valor bigint not null check (valor > 0),
  recibido_por uuid not null references auth.users(id),
  clave uuid not null unique,
  estado text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  motivo_anulacion text,
  anulado_en timestamptz,
  detalle jsonb,
  creado_en timestamptz not null default now()
);

create table aplicacion_pagos (
  pago_id uuid not null references pagos(id),
  cobro_id uuid not null references cobros(id),
  valor bigint not null check (valor > 0),
  primary key (pago_id, cobro_id)
);

-- Recalcula desde cero la aplicación de los pagos vigentes de un contrato:
-- pagos por (fecha, número) sobre cobros por periodo, el más antiguo primero.
create function reaplicar_pagos(p_contrato uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  p record;
  k record;
  v_resto bigint;
  v_monto bigint;
begin
  delete from aplicacion_pagos a using pagos pg where a.pago_id = pg.id and pg.contrato_id = p_contrato;

  for p in select id, valor from pagos where contrato_id = p_contrato and estado = 'vigente' order by fecha, numero loop
    v_resto := p.valor;
    for k in
      select c.id, c.total - coalesce((select sum(a.valor) from aplicacion_pagos a where a.cobro_id = c.id), 0) as pendiente
      from cobros c where c.contrato_id = p_contrato order by c.periodo
    loop
      exit when v_resto = 0;
      continue when k.pendiente <= 0;
      v_monto := least(v_resto, k.pendiente);
      insert into aplicacion_pagos(pago_id, cobro_id, valor) values (p.id, k.id, v_monto);
      v_resto := v_resto - v_monto;
    end loop;
  end loop;

  update cobros c set
    saldo = c.total - coalesce((select sum(a.valor) from aplicacion_pagos a where a.cobro_id = c.id), 0)
  where c.contrato_id = p_contrato;
  update cobros set estado = case when saldo = 0 then 'pagado' when saldo = total then 'pendiente' else 'parcial' end
  where contrato_id = p_contrato;
end $$;

-- Ahora el recálculo de un cobro también reaplica los pagos (y el saldo a favor) del contrato.
create or replace function recalcular_cobro(p_cobro uuid) returns void language plpgsql as $$
declare
  v_contrato uuid;
begin
  update cobros k set total = coalesce((select sum(valor) from lineas_cobro where cobro_id = k.id), 0)
  where k.id = p_cobro returning contrato_id into v_contrato;
  perform reaplicar_pagos(v_contrato);
end $$;

create function saldo_a_favor(p_contrato uuid) returns bigint language sql stable as $$
  select coalesce((select sum(valor) from pagos where contrato_id = p_contrato and estado = 'vigente'), 0)
       - coalesce((select sum(a.valor) from aplicacion_pagos a join pagos p on p.id = a.pago_id
                   where p.contrato_id = p_contrato and p.estado = 'vigente'), 0)
$$;

create function registrar_pago(p_contrato uuid, p_valor bigint, p_fecha date, p_clave uuid)
returns pagos language plpgsql security definer set search_path = public as $$
declare
  v_pago pagos;
  v_numero bigint;
begin
  if not es_admin() then raise exception 'Solo el administrador puede registrar pagos'; end if;
  if p_clave is null then raise exception 'Falta la clave de la solicitud'; end if;

  select * into v_pago from pagos where clave = p_clave;
  if found then return v_pago; end if;

  if p_valor is null or p_valor <= 0 then raise exception 'El valor del pago debe ser mayor que cero'; end if;
  if not exists (select 1 from contratos where id = p_contrato) then raise exception 'Contrato no encontrado'; end if;

  update consecutivos set ultimo = ultimo + 1 where nombre = 'recibo' returning ultimo into v_numero;

  insert into pagos(numero, contrato_id, fecha, valor, recibido_por, clave)
    values (v_numero, p_contrato, coalesce(p_fecha, (now() at time zone 'America/Bogota')::date), p_valor, auth.uid(), p_clave)
    returning * into v_pago;

  perform reaplicar_pagos(p_contrato);

  update pagos set detalle = jsonb_build_object(
      'conceptos', coalesce((select jsonb_agg(jsonb_build_object('periodo', c.periodo, 'valor', a.valor) order by c.periodo)
                             from aplicacion_pagos a join cobros c on c.id = a.cobro_id where a.pago_id = v_pago.id), '[]'::jsonb),
      'saldo_pendiente', (select coalesce(sum(saldo), 0) from cobros where contrato_id = p_contrato),
      'saldo_a_favor', saldo_a_favor(p_contrato))
  where id = v_pago.id
  returning * into v_pago;

  return v_pago;
end $$;
