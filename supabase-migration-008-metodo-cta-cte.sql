-- Migración 008: registrar con qué método se pagó cada abono a cuenta
-- corriente (puede ser uno o varios métodos por pago).
-- Ejecutar completo en el SQL Editor de Supabase.

alter table cuenta_corriente_movimientos add column if not exists metodo text;
