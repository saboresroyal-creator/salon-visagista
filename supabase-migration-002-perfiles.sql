-- Migración 002: usuarios internos y permisos por módulo.
-- Se apoya en Supabase Auth (auth.users); esta tabla guarda el perfil
-- de cada usuario (nombre, rol, a qué pestañas del sistema puede entrar).
-- Ejecutar completo en el SQL Editor de Supabase.

create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null default 'usuario' check (rol in ('admin', 'usuario')),
  permisos jsonb not null default '[]'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
