-- Migración 001: esquema base para calendario multi-profesional,
-- servicios, productos, facturación y egresos.
-- Ejecutar completo en el SQL Editor de Supabase.

create extension if not exists pgcrypto;

-- ── Profesionales ──
create table if not exists profesionales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  color text default '#5b8def',
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Servicios ──
create table if not exists servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text,
  duracion_min integer not null default 30,
  precio numeric(12,2) not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Productos ──
create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  precio numeric(12,2) not null default 0,
  costo numeric(12,2) not null default 0,
  stock integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Turnos (calendario) ──
create table if not exists turnos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  profesional_id uuid not null references profesionales(id) on delete restrict,
  fecha date not null,
  hora_inicio time not null,
  hora_fin time not null,
  estado text not null default 'confirmado' check (estado in ('confirmado','cancelado','completado')),
  notas text,
  creado_por text,
  created_at timestamptz not null default now()
);

create index if not exists idx_turnos_fecha on turnos(fecha);
create index if not exists idx_turnos_profesional on turnos(profesional_id);
create index if not exists idx_turnos_cliente on turnos(cliente_id);

-- Servicios asignados a un turno (un turno puede tener varios, ej. "color y corte")
create table if not exists turno_servicios (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos(id) on delete cascade,
  servicio_id uuid not null references servicios(id) on delete restrict,
  precio numeric(12,2) not null default 0
);

create index if not exists idx_turno_servicios_turno on turno_servicios(turno_id);

-- ── Ventas (facturación) ──
create table if not exists ventas (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid references turnos(id) on delete set null,
  cliente_id uuid references clientes(id) on delete set null,
  fecha date not null default current_date,
  metodo_pago text,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ventas_fecha on ventas(fecha);

create table if not exists venta_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id) on delete cascade,
  tipo text not null check (tipo in ('servicio','producto')),
  referencia_id uuid,
  descripcion text not null,
  cantidad integer not null default 1,
  precio_unitario numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0
);

create index if not exists idx_venta_items_venta on venta_items(venta_id);

-- ── Egresos / Compras ──
create table if not exists egresos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  concepto text not null,
  categoria text,
  monto numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_egresos_fecha on egresos(fecha);

-- ── Marketing: log de mensajes enviados ──
create table if not exists mensajes_enviados (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete cascade,
  tipo text not null check (tipo in ('cumpleanos','recordatorio')),
  mensaje text,
  enviado_at timestamptz not null default now()
);
