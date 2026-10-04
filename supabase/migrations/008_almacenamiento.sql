-- 008: Almacenamiento de fotos/PDF de facturas y lecturas (bucket privado 'soportes').
-- Rutas: facturas/<factura_id>/<archivo> y lecturas/<lectura_id>/<archivo>.
-- Se omite si no existe el esquema storage (pruebas locales).

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    return;
  end if;

  insert into storage.buckets (id, name, public) values ('soportes', 'soportes', false)
    on conflict (id) do nothing;

  execute $p$
    create policy soportes_admin on storage.objects for all to authenticated
      using (bucket_id = 'soportes' and public.es_admin())
      with check (bucket_id = 'soportes' and public.es_admin())
  $p$;

  execute $p$
    create policy soportes_ver on storage.objects for select to authenticated
      using (bucket_id = 'soportes' and (
        exists (select 1 from public.facturas_servicio f where f.archivo = storage.objects.name)
        or exists (select 1 from public.lecturas l where l.foto = storage.objects.name)))
  $p$;
end $$;
