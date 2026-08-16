-- Migración 006: tipos de usuario (roles) con paquete de permisos fijo.
-- Ejecutar completo en el SQL Editor de Supabase.

alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check
  check (rol in ('admin', 'usuario', 'profesional', 'recepcionista', 'encargada'));
