-- Migración 013: comandas internas (profesional carga sin ver precios,
-- recepción cobra) + comisiones por profesional.
-- Ejecutar completo en el SQL Editor de Supabase.

-- ── Reconciliación: columnas/tablas que ya existen en producción (usadas en
-- server.js/comandas.js/facturacion.js) pero nunca quedaron en una migración
-- versionada (la 005 quedó vacía). Todo con "if not exists" para que no
-- rompa nada si ya están creadas.
alter table ventas add column if not exists estado text not null default 'cobrada';
alter table ventas drop constraint if exists ventas_estado_check;
alter table ventas add constraint ventas_estado_check check (estado in ('pendiente', 'cobrada'));
alter table ventas add column if not exists atendido_por_id uuid references profesionales(id) on delete set null;
alter table ventas add column if not exists ajuste_pct numeric(5,2) not null default 0;
alter table ventas add column if not exists subtotal numeric(12,2);

alter table venta_items add column if not exists profesional_diag_id uuid references profesionales(id) on delete set null;
alter table venta_items add column if not exists profesional_asist_id uuid references profesionales(id) on delete set null;

alter table clientes add column if not exists saldo_cta_cte numeric(12,2) not null default 0;

create table if not exists venta_pagos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id) on delete cascade,
  metodo text not null,
  monto numeric(12,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_venta_pagos_venta on venta_pagos(venta_id);

create table if not exists cuenta_corriente_movimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null check (tipo in ('cargo', 'pago', 'ajuste')),
  monto numeric(12,2) not null,
  motivo text,
  metodo text,
  venta_id uuid references ventas(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_cuenta_corriente_cliente on cuenta_corriente_movimientos(cliente_id);

create table if not exists tratamientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  fecha date not null,
  servicio text,
  productos text,
  obs text,
  fotos jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_tratamientos_cliente on tratamientos(cliente_id);

-- ── Nuevo para comandas internas ──

-- Observaciones que carga la profesional al armar la comanda ("se usó
-- tratamiento reparación intensiva").
alter table ventas add column if not exists notas text;

-- % de comisión que cobra cada profesional sobre lo que factura como
-- principal (profesional_diag_id), configurado por el administrador.
alter table profesionales add column if not exists comision_pct numeric(5,2) not null default 0;

-- Vínculo entre el login (perfiles.rol = 'profesional') y su fila en el
-- equipo/calendario: sin esto no se puede saber "los turnos de quién".
alter table perfiles add column if not exists profesional_id uuid references profesionales(id) on delete set null;

-- El profesional ya no debe ver precios: se le saca el permiso que abría la
-- pantalla de comandas con precios y se le da el de su pantalla nueva.
delete from rol_permisos where rol = 'profesional' and permiso = 'comandas:crear';
insert into rol_permisos (rol, permiso) values ('profesional', 'comandas:cargar_propia')
  on conflict (rol, permiso) do nothing;
insert into rol_permisos (rol, permiso) values ('encargada', 'comisiones:ver')
  on conflict (rol, permiso) do nothing;
