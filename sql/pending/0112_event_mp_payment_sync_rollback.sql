-- Rollback no destructivo de 0112: restaura la definición previa del recálculo y
-- elimina la RPC nueva. No toca filas; el webhook vuelve a su ruta legacy.
DROP FUNCTION IF EXISTS public.register_event_mp_payment(uuid, text, text, numeric, integer, date);
\i tests/sql/event_payment_sync_baseline_recalc.sql
