
-- Quita movimientos_liquidacion y reservas_turnera del broadcast Realtime.
-- Estas tablas contienen PII (DNI, email, teléfono, fechas) y datos de honorarios
-- de coaches que NO deben transmitirse a cualquier suscriptor autenticado.
-- La UI no necesita realtime sobre estas tablas (se refrescan on-demand).

ALTER PUBLICATION supabase_realtime DROP TABLE public.movimientos_liquidacion;
ALTER PUBLICATION supabase_realtime DROP TABLE public.reservas_turnera;
