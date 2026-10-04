-- 001: Esquema base — propietarios, propiedades, unidades, inquilinos, contratos y perfiles.

create table propietarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  documento text,
  telefono text,
  correo text,
  creado_en timestamptz not null default now()
);

create table propiedades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text,
  ciudad text,
  propietario_id uuid not null references propietarios(id),
  creado_en timestamptz not null default now()
);

create table unidades (
  id uuid primary key default gen_random_uuid(),
  propiedad_id uuid not null references propiedades(id),
  tipo text not null check (tipo in ('apartamento', 'apartaestudio', 'local')),
  identificador text not null,
  canon bigint not null check (canon >= 0),
  estado text not null default 'disponible' check (estado in ('disponible', 'ocupada', 'inactiva')),
  creado_en timestamptz not null default now(),
  unique (propiedad_id, identificador)
);

create table inquilinos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  documento text,
  telefono text,
  correo text,
  creado_en timestamptz not null default now()
);

create table contratos (
  id uuid primary key default gen_random_uuid(),
  unidad_id uuid not null references unidades(id),
  inquilino_id uuid not null references inquilinos(id),
  fecha_inicio date not null,
  fecha_fin date,
  canon bigint not null check (canon >= 0),
  dia_pago int not null default 5 check (dia_pago between 1 and 28),
  estado text not null default 'activo' check (estado in ('activo', 'terminado')),
  creado_en timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create unique index contratos_un_activo_por_unidad on contratos(unidad_id) where estado = 'activo';

create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('admin', 'inquilino', 'propietario')),
  propietario_id uuid references propietarios(id),
  inquilino_id uuid references inquilinos(id),
  check (rol <> 'propietario' or propietario_id is not null),
  check (rol <> 'inquilino' or inquilino_id is not null)
);

-- El canon del contrato se copia de la unidad cuando no se indica.
create function contratos_antes_insertar() returns trigger language plpgsql as $$
begin
  if new.canon is null then
    select canon into new.canon from unidades where id = new.unidad_id;
  end if;
  return new;
end $$;

create trigger contratos_antes_insertar before insert on contratos
  for each row execute function contratos_antes_insertar();

-- El estado de la unidad sigue al contrato activo.
create function contratos_despues_cambio() returns trigger language plpgsql as $$
begin
  if new.estado = 'activo' then
    update unidades set estado = 'ocupada' where id = new.unidad_id;
  elsif tg_op = 'UPDATE' and old.estado = 'activo' then
    update unidades set estado = 'disponible'
      where id = new.unidad_id and estado = 'ocupada'
        and not exists (select 1 from contratos c where c.unidad_id = new.unidad_id and c.estado = 'activo');
  end if;
  return new;
end $$;

create trigger contratos_despues_cambio after insert or update of estado on contratos
  for each row execute function contratos_despues_cambio();

-- Ayudantes de rol (security definer para poder leer perfiles con RLS activo).
create function es_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'admin')
$$;

create function mi_propietario() returns uuid language sql stable security definer set search_path = public as $$
  select propietario_id from perfiles where id = auth.uid() and rol = 'propietario'
$$;

create function mi_inquilino() returns uuid language sql stable security definer set search_path = public as $$
  select inquilino_id from perfiles where id = auth.uid() and rol = 'inquilino'
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
