
-- 1) Vista de cuenta corriente: evitar doble conteo de créditos ya aplicados
CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS
WITH base AS (
  SELECT * FROM public.vw_cuenta_corriente_movimientos
)
SELECT * FROM base;

-- (placeholder reemplazado abajo)
