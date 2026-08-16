-- Migración 011: listas de precio (un servicio puede valer distinto según
-- la lista elegida al armar la comanda).
-- Ejecutar completo en el SQL Editor de Supabase.

create table if not exists listas_precio (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Precio por lista, guardado como {"<lista_id>": precio, ...}. Si un
-- servicio no tiene entrada para la lista elegida, se usa su precio base.
alter table servicios add column if not exists precios_por_lista jsonb not null default '{}'::jsonb;
