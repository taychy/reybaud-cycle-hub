ALTER TABLE public.reservation_addons
  ADD COLUMN IF NOT EXISTS noche_timing text NULL;

ALTER TABLE public.reservation_addons
  DROP CONSTRAINT IF EXISTS reservation_addons_noche_timing_check;

ALTER TABLE public.reservation_addons
  ADD CONSTRAINT reservation_addons_noche_timing_check
  CHECK (noche_timing IS NULL OR noche_timing IN ('antes','despues','ambas'));

COMMENT ON COLUMN public.reservation_addons.noche_timing IS 'Para extras de tipo noche extra: antes | despues | ambas (ambas = 2 noches). NULL para otros extras o datos históricos.';