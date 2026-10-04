CREATE TABLE public.program_preinscripcion_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.planes(id) ON DELETE CASCADE,
  waitlist_entry_id uuid REFERENCES public.waitlist_template_entries(id) ON DELETE SET NULL,
  email text NOT NULL,
  nombre text,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  precio_total numeric NOT NULL,
  precio_cuota numeric,
  cuotas_cantidad int NOT NULL DEFAULT 1,
  valid_until date NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  es_prueba boolean NOT NULL DEFAULT false,
  email_sent_at timestamptz,
  email_message_id text,
  email_status text,
  opened_at timestamptz,
  open_count int NOT NULL DEFAULT 0,
  used_at timestamptz,
  suscripcion_id uuid REFERENCES public.suscripciones(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX program_preinsc_benefits_plan_email_uq ON public.program_preinscripcion_benefits (plan_id, lower(email), es_prueba);
GRANT ALL ON public.program_preinscripcion_benefits TO service_role;
GRANT SELECT ON public.program_preinscripcion_benefits TO authenticated;
ALTER TABLE public.program_preinscripcion_benefits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read program benefits" ON public.program_preinscripcion_benefits
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Public: resolve a personal benefit token (only that row, minimal fields) and register the open.
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
    'expired', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date > b.valid_until,
    'cohort_slug', slug,
    'nombre', b.nombre,
    'precio_total', b.precio_total,
    'precio_cuota', b.precio_cuota,
    'cuotas_cantidad', b.cuotas_cantidad,
    'valid_until', b.valid_until
  );
END $$;
REVOKE ALL ON FUNCTION public.get_program_benefit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_program_benefit(text) TO anon, authenticated, service_role;