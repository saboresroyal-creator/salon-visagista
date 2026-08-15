-- Migración 004: sistema de stock con código de barras.
-- Ejecutar completo en el SQL Editor de Supabase.

alter table productos add column if not exists barcode text;
alter table productos add column if not exists stock_minimo integer not null default 0;

create table if not exists stock_movimientos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  cantidad integer not null,
  stock_anterior integer not null,
  stock_nuevo integer not null,
  motivo text,
  usuario_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movimientos_producto on stock_movimientos(producto_id, created_at desc);
