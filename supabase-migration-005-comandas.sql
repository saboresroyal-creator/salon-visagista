-- Migración 005: comandas (pendiente de cobro), pago dividido, comisiones
-- por ítem (ASIST/DIAG) y cuenta corriente de clientes.
-- Ejecutar completo en el SQL Editor de Supabase.

alter table ventas add column if not exists estado text not null default 'cobrada' check (estado in ('pendiente', 'cobrada'));

create table if not exists venta_pagos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id) on delete cascade,
  metodo text not null,
  monto numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_venta_pagos_venta on venta_pagos(venta_id);

alter table venta_items add column if not exists profesional_diag_id uuid references profesionales(id) on delete set null;
alter table venta_items add column if not exists profesional_asist_id uuid references profesionales(id) on delete set null;

alter table clientes add column if not exists saldo_cta_cte numeric(12,2) not null default 0;

create table if not exists cuenta_corriente_movimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null check (tipo in ('cargo', 'pago', 'ajuste')),
  monto numeric(12,2) not null,
  motivo text,
  venta_id uuid references ventas(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cuenta_corriente_cliente on cuenta_corriente_movimientos(cliente_id);
