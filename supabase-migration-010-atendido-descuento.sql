-- Migración 010: "Atendido por" general y descuento/recargo % por venta.
-- Ejecutar completo en el SQL Editor de Supabase.

alter table ventas add column if not exists atendido_por_id uuid references profesionales(id) on delete set null;
alter table ventas add column if not exists ajuste_pct numeric(5,2) not null default 0;
alter table ventas add column if not exists subtotal numeric(12,2);

update ventas set subtotal = total where subtotal is null;
