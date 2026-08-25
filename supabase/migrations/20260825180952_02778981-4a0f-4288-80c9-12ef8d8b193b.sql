ALTER TABLE public.pagos_imputaciones DROP CONSTRAINT IF EXISTS pagos_imputaciones_obligacion_tipo_check;
ALTER TABLE public.pagos_imputaciones ADD CONSTRAINT pagos_imputaciones_obligacion_tipo_check
  CHECK (obligacion_tipo IN ('suscripcion','reserva','store_order','turnera','otro'));