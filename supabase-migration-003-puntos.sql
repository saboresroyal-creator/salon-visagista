-- Migración 003: sistema de puntos por clienta.
-- Ejecutar completo en el SQL Editor de Supabase.

alter table clientes add column if not exists puntos integer not null default 0;

create table if not exists puntos_movimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null check (tipo in ('ganado', 'canjeado', 'ajuste')),
  puntos integer not null,
  motivo text,
  venta_id uuid references ventas(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_puntos_movimientos_cliente on puntos_movimientos(cliente_id);
