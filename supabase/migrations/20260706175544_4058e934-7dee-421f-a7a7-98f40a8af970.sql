
-- 1) Eliminar auto-sync de "segunda actividad": los descuentos ahora se manejan sólo manualmente por admin.
DROP TRIGGER IF EXISTS trg_suscripciones_segunda_actividad ON public.suscripciones;
DROP FUNCTION IF EXISTS public.trg_sync_segunda_actividad() CASCADE;
DROP FUNCTION IF EXISTS public.sync_segunda_actividad_discount(uuid) CASCADE;

-- 2) Nuevo campo "origen" en descuentos_alumno para trazabilidad.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='descuentos_alumno' AND column_name='origen'
  ) THEN
    ALTER TABLE public.descuentos_alumno
      ADD COLUMN origen text NOT NULL DEFAULT 'manual_admin';
    ALTER TABLE public.descuentos_alumno
      ADD CONSTRAINT descuentos_alumno_origen_chk
      CHECK (origen IN ('manual_admin','promocion','beca','ajuste_excepcional'));
  END IF;
END $$;
