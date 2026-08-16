-- Migración 009: recordatorios de turno (una semana antes y 24hs antes)
-- basados en los turnos reales del calendario, en vez del campo manual
-- "próxima cita" del cliente (que no se actualizaba solo al agendar).
-- Ejecutar completo en el SQL Editor de Supabase.

alter table mensajes_enviados drop constraint if exists mensajes_enviados_tipo_check;
alter table mensajes_enviados add constraint mensajes_enviados_tipo_check
  check (tipo in ('cumpleanos', 'recordatorio', 'recordatorio_semana', 'recordatorio_24h'));

alter table mensajes_enviados add column if not exists turno_id uuid references turnos(id) on delete set null;

create index if not exists idx_mensajes_enviados_turno on mensajes_enviados(turno_id, tipo);
