-- Migración 012: reservas online (página pública sin login).
-- Ejecutar completo en el SQL Editor de Supabase.

-- Horarios de trabajo por profesional y día de semana (0=domingo..6=sábado).
-- Un solo turno corrido por día en v1 (no turnos partidos / doble jornada).
-- Si un profesional no tiene fila para un día, se considera día libre.
create table if not exists profesionales_horarios (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references profesionales(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fin time not null,
  created_at timestamptz not null default now(),
  unique (profesional_id, dia_semana)
);
create index if not exists idx_profesionales_horarios_prof on profesionales_horarios(profesional_id);

-- Permite ocultar un servicio puntual de la reserva online sin desactivarlo
-- del todo (sigue disponible para cargarlo manualmente en el calendario).
alter table servicios add column if not exists reservable_online boolean not null default true;

-- Nuevo estado 'pendiente': turno creado desde la reserva pública, todavía
-- sin confirmar por el salón.
alter table turnos drop constraint if exists turnos_estado_check;
alter table turnos add constraint turnos_estado_check
  check (estado in ('confirmado','cancelado','completado','pendiente'));
