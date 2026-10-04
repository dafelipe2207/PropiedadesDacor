-- 011: Permisos de funciones. En Postgres todas las funciones se pueden ejecutar por PUBLIC (incluye anon),
-- así que se quita a PUBLIC y se concede solo a usuarios con sesión. Las internas quedan solo para el dueño.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function reaplicar_pagos(uuid) from authenticated;
revoke execute on function recalcular_cobro(uuid) from authenticated;
revoke execute on function contratos_recalcular_arriendo() from authenticated;
revoke execute on function contratos_antes_insertar() from authenticated;
revoke execute on function contratos_despues_cambio() from authenticated;
revoke execute on function lecturas_validar() from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

-- search_path fijo en todas las funciones (recomendación del asesor de seguridad de Supabase).
alter function calcular_servicio(uuid) set search_path = public;
alter function hoy_bogota() set search_path = public;
alter function contratos_despues_cambio() set search_path = public;
alter function periodo_valido(text) set search_path = public;
alter function periodo_inicio(text) set search_path = public;
alter function periodo_fin(text) set search_path = public;
alter function contrato_en_periodo(uuid, text) set search_path = public;
alter function arriendo_proporcional(bigint, date, date, text) set search_path = public;
alter function nombre_servicio(text) set search_path = public;
alter function contratos_antes_insertar() set search_path = public;
alter function alertas_servicio(uuid) set search_path = public;
alter function lectura_anterior(uuid, text) set search_path = public;
alter function lecturas_del_periodo(uuid, text) set search_path = public;
alter function saldo_a_favor(uuid) set search_path = public;
alter function propietario_de_pago(uuid) set search_path = public;
alter function entrega_del_pago(uuid) set search_path = public;
alter function lecturas_validar() set search_path = public;
alter function cerrar_servicio(uuid) set search_path = public;
