CREATE OR REPLACE FUNCTION public.consume_program_benefit_on_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado = 'activa' AND OLD.estado IS DISTINCT FROM 'activa' THEN
    UPDATE public.program_preinscripcion_benefits
       SET used_at = now(), updated_at = now()
     WHERE suscripcion_id = NEW.id AND used_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.consume_program_benefit_on_paid() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_consume_program_benefit_on_paid ON public.suscripciones;
CREATE TRIGGER trg_consume_program_benefit_on_paid
AFTER UPDATE OF estado ON public.suscripciones
FOR EACH ROW EXECUTE FUNCTION public.consume_program_benefit_on_paid();

CREATE OR REPLACE FUNCTION public.get_program_benefit(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; slug text;
BEGIN
  IF _token IS NULL OR length(_token) < 32 THEN RETURN jsonb_build_object('valid', false); END IF;
  SELECT * INTO b FROM program_preinscripcion_benefits WHERE token = _token;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid', false); END IF;
  SELECT cohort_slug INTO slug FROM planes WHERE id = b.plan_id;
  UPDATE program_preinscripcion_benefits
    SET opened_at = COALESCE(opened_at, now()), open_count = open_count + 1, updated_at = now()
    WHERE id = b.id;
  RETURN jsonb_build_object(
    'valid', b.activo AND b.used_at IS NULL AND (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= b.valid_until,
    'used', b.used_at IS NOT NULL,
    'pending_payment', b.used_at IS NULL AND b.suscripcion_id IS NOT NULL,
    'expired', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date > b.valid_until,
    'cohort_slug', slug,
    'nombre', b.nombre,
    'precio_total', b.precio_total,
    'precio_cuota', b.precio_cuota,
    'cuotas_cantidad', b.cuotas_cantidad,
    'valid_until', b.valid_until
  );
END $$;