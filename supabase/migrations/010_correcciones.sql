-- 010: Correcciones de la revisión final.

-- Funciones internas de dinero: solo las usan otras funciones (security definer), nunca la API.
create or replace function reaplicar_pagos(p_contrato uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  p record;
  k record;
  v_resto bigint;
  v_monto bigint;
begin
  perform 1 from contratos where id = p_contrato for update; -- serializa recálculos del mismo contrato
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

create or replace function recalcular_cobro(p_cobro uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  v_contrato uuid;
begin
  update cobros k set total = coalesce((select sum(valor) from lineas_cobro where cobro_id = k.id), 0)
  where k.id = p_cobro returning contrato_id into v_contrato;
  perform reaplicar_pagos(v_contrato);
end $$;

revoke execute on function reaplicar_pagos(uuid) from public, anon, authenticated;
revoke execute on function recalcular_cobro(uuid) from public, anon, authenticated;

-- Generar cobros: solo el administrador (las pruebas y el SQL del servidor no tienen usuario).
-- La fecha límite nunca es anterior al inicio del contrato.
create or replace function generar_cobros(p_periodo text) returns int language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_cobro uuid;
  v_nuevas int := 0;
  v_n int;
begin
  if auth.uid() is not null and not es_admin() then
    raise exception 'Solo el administrador puede generar cobros';
  end if;
  if p_periodo is null or not periodo_valido(p_periodo) then
    raise exception 'Periodo inválido: %. Use el formato AAAA-MM', p_periodo;
  end if;

  for c in
    select k.*, u.identificador from contratos k join unidades u on u.id = k.unidad_id
    where k.fecha_inicio <= periodo_fin(p_periodo)
      and coalesce(k.fecha_fin, 'infinity'::date) >= periodo_inicio(p_periodo)
  loop
    insert into cobros(contrato_id, periodo, fecha_limite)
      values (c.id, p_periodo, greatest(periodo_inicio(p_periodo) + (c.dia_pago - 1), c.fecha_inicio))
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

-- Si cambian las fechas o el canon de un contrato, se recalcula el arriendo de los cobros ya generados.
create function contratos_recalcular_arriendo() returns trigger language plpgsql security definer set search_path = public as $$
declare
  k record;
begin
  for k in select id, periodo from cobros where contrato_id = new.id loop
    update lineas_cobro set valor = arriendo_proporcional(new.canon, new.fecha_inicio, new.fecha_fin, k.periodo)
    where cobro_id = k.id and concepto = 'arriendo';
    update cobros set fecha_limite = greatest(periodo_inicio(k.periodo) + (new.dia_pago - 1), new.fecha_inicio)
    where id = k.id;
    perform recalcular_cobro(k.id);
  end loop;
  return new;
end $$;

create trigger contratos_recalcular_arriendo
  after update of fecha_inicio, fecha_fin, canon, dia_pago on contratos
  for each row execute function contratos_recalcular_arriendo();

-- Lecturas: tampoco pueden superar la del periodo siguiente (evita consumos negativos).
create or replace function lecturas_validar() returns trigger language plpgsql as $$
declare
  v_anterior numeric;
  v_siguiente lecturas;
begin
  select * into v_siguiente from lecturas
  where subcontador_id = new.subcontador_id and periodo > new.periodo
  order by periodo limit 1;
  if found and not v_siguiente.cambio_contador and new.lectura > v_siguiente.lectura then
    raise exception 'La lectura es mayor que la del periodo siguiente (%)', v_siguiente.lectura;
  end if;

  if exists (select 1 from facturas_servicio f join subcontadores s on s.servicio_id = f.servicio_id
             where s.id = new.subcontador_id and f.periodo = new.periodo and f.cerrada) then
    raise exception 'El servicio de este periodo ya está cerrado';
  end if;

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
  return new;
end $$;

-- Cerrar: nunca con consumos negativos.
create or replace function cerrar_servicio(p_factura uuid) returns void language plpgsql as $$
declare
  f facturas_servicio;
  v_alerta text;
  v_negativa text;
begin
  select * into f from facturas_servicio where id = p_factura for update;
  if f.cerrada then raise exception 'El servicio de este periodo ya está cerrado'; end if;
  select a.mensaje into v_alerta from alertas_servicio(p_factura) a where a.tipo = 'falta_lectura';
  if v_alerta is not null then raise exception '%', v_alerta; end if;
  select string_agg(u.identificador, ', ') into v_negativa
  from calcular_servicio(p_factura) c join unidades u on u.id = c.unidad_id where c.consumo < 0;
  if v_negativa is not null then raise exception 'Consumo negativo en: %. Revise las lecturas.', v_negativa; end if;

  insert into distribucion_servicio(factura_id, unidad_id, contrato_id, consumo, valor)
    select p_factura, c.unidad_id, c.contrato_id, c.consumo, c.valor from calcular_servicio(p_factura) c;

  update facturas_servicio set cerrada = true,
    diferencia = f.valor - coalesce((select sum(d.valor) from distribucion_servicio d
                                     where d.factura_id = p_factura and d.contrato_id is not null), 0)
  where id = p_factura;
end $$;

-- Visitantes sin sesión no ejecutan ninguna función de la app.
revoke execute on all functions in schema public from anon;
