-- Migración 007: permisos granulares por rol (reemplaza el acceso por
-- módulo completo). Ejecutar completo en el SQL Editor de Supabase.

alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check
  check (rol in ('admin', 'usuario', 'profesional', 'recepcionista', 'encargada', 'cajero'));

create table if not exists rol_permisos (
  id uuid primary key default gen_random_uuid(),
  rol text not null,
  permiso text not null,
  created_at timestamptz not null default now(),
  unique (rol, permiso)
);

create index if not exists idx_rol_permisos_rol on rol_permisos(rol);

-- Semilla: paquete inicial por rol (editable después desde "Permisos por Rol").
insert into rol_permisos (rol, permiso) values
  ('profesional', 'calendario:ver'),
  ('profesional', 'calendario:gestionar'),
  ('profesional', 'comandas:crear'),

  ('recepcionista', 'calendario:ver'),
  ('recepcionista', 'calendario:gestionar'),
  ('recepcionista', 'clientes:ver'),
  ('recepcionista', 'clientes:gestionar'),
  ('recepcionista', 'comandas:crear'),
  ('recepcionista', 'facturacion:ver'),
  ('recepcionista', 'facturacion:cobrar'),
  ('recepcionista', 'facturacion:crear'),

  ('cajero', 'comandas:crear'),
  ('cajero', 'facturacion:ver'),
  ('cajero', 'facturacion:cobrar'),
  ('cajero', 'facturacion:crear'),

  ('encargada', 'dashboard:ver'),
  ('encargada', 'calendario:ver'),
  ('encargada', 'calendario:gestionar'),
  ('encargada', 'clientes:ver'),
  ('encargada', 'clientes:gestionar'),
  ('encargada', 'clientes:eliminar'),
  ('encargada', 'clientes:puntos'),
  ('encargada', 'clientes:cuenta_corriente'),
  ('encargada', 'catalogo:ver'),
  ('encargada', 'catalogo:gestionar'),
  ('encargada', 'catalogo:eliminar'),
  ('encargada', 'stock:ver'),
  ('encargada', 'stock:movimientos'),
  ('encargada', 'stock:eliminar'),
  ('encargada', 'comandas:crear'),
  ('encargada', 'facturacion:ver'),
  ('encargada', 'facturacion:cobrar'),
  ('encargada', 'facturacion:crear'),
  ('encargada', 'facturacion:eliminar'),
  ('encargada', 'egresos:ver'),
  ('encargada', 'egresos:gestionar'),
  ('encargada', 'egresos:eliminar'),
  ('encargada', 'reportes:ver'),
  ('encargada', 'marketing:ver'),
  ('encargada', 'marketing:enviar')
on conflict (rol, permiso) do nothing;
