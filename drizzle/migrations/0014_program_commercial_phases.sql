-- 1) Fechas comerciales por programa (nullable: programas legacy siguen funcionando)
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS fecha_inicio_preinscripcion date,
  ADD COLUMN IF NOT EXISTS fecha_fin_preinscripcion date,
  ADD COLUMN IF NOT EXISTS fecha_inicio_inscripcion date,
  ADD COLUMN IF NOT EXISTS fecha_fin_inscripcion date,
  ADD COLUMN IF NOT EXISTS preinscripcion_slug text;

COMMENT ON COLUMN public.planes.fecha_cierre_inscripcion IS 'Legacy: fallback de fecha_fin_inscripcion cuando las fechas comerciales nuevas no están configuradas.';

-- 2) Sedes por programa: horario y cupo independientes
ALTER TABLE public.planes_sedes
  ADD COLUMN IF NOT EXISTS activa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dia_semana smallint,
  ADD COLUMN IF NOT EXISTS hora_inicio time,
  ADD COLUMN IF NOT EXISTS hora_fin time,
  ADD COLUMN IF NOT EXISTS cupo_maximo integer,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.planes_sedes
  ADD CONSTRAINT planes_sedes_dia_semana_chk CHECK (dia_semana IS NULL OR dia_semana BETWEEN 0 AND 6),
  ADD CONSTRAINT planes_sedes_cupo_chk CHECK (cupo_maximo IS NULL OR cupo_maximo >= 0);

-- 3) Sede elegida en la inscripción a programa (nullable para histórico)
ALTER TABLE public.suscripciones
  ADD COLUMN IF NOT EXISTS programa_sede_id uuid REFERENCES public.sedes(id);
CREATE INDEX IF NOT EXISTS suscripciones_plan_sede_idx ON public.suscripciones(plan_id, programa_sede_id) WHERE programa_sede_id IS NOT NULL;

-- Cupo por sede: bloqueo transaccional para evitar sobrecupo concurrente
CREATE OR REPLACE FUNCTION public.enforce_programa_sede_cupo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cupo integer;
  v_activa boolean;
  v_usados integer;
BEGIN
  IF NEW.programa_sede_id IS NULL OR NEW.estado NOT IN ('activa','pendiente_pago','pendiente_verificacion') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.programa_sede_id IS NOT DISTINCT FROM NEW.programa_sede_id
     AND OLD.estado IN ('activa','pendiente_pago','pendiente_verificacion') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('programa_sede:' || NEW.plan_id::text || ':' || NEW.programa_sede_id::text));
  SELECT cupo_maximo, activa INTO v_cupo, v_activa
  FROM public.planes_sedes WHERE plan_id = NEW.plan_id AND sede_id = NEW.programa_sede_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SEDE_NO_DISPONIBLE' USING ERRCODE = 'P0001';
  END IF;
  IF v_cupo IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_usados FROM public.suscripciones s
  WHERE s.plan_id = NEW.plan_id AND s.programa_sede_id = NEW.programa_sede_id
    AND s.estado IN ('activa','pendiente_pago','pendiente_verificacion')
    AND s.id <> NEW.id;
  IF v_usados >= v_cupo THEN
    RAISE EXCEPTION 'SEDE_SIN_CUPO' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_enforce_programa_sede_cupo
BEFORE INSERT OR UPDATE OF programa_sede_id, estado ON public.suscripciones
FOR EACH ROW EXECUTE FUNCTION public.enforce_programa_sede_cupo();

-- 4) Lista de espera de programas por sede (independiente de eventos)
CREATE TABLE public.program_waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.planes(id) ON DELETE CASCADE,
  sede_id uuid REFERENCES public.sedes(id),
  nombre text NOT NULL,
  email text NOT NULL,
  telefono text,
  estado text NOT NULL DEFAULT 'pendiente',
  origen text NOT NULL DEFAULT 'landing',
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_waitlist_estado_chk CHECK (estado IN ('pendiente','contactado','inscripto','descartado'))
);
CREATE UNIQUE INDEX program_waitlist_unique_email
  ON public.program_waitlist_entries (plan_id, COALESCE(sede_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_waitlist_entries TO authenticated;
GRANT ALL ON public.program_waitlist_entries TO service_role;
ALTER TABLE public.program_waitlist_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage program waitlist" ON public.program_waitlist_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER program_waitlist_updated_at BEFORE UPDATE ON public.program_waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Fase comercial (misma regla que src/lib/programCommercialPhase.ts)
CREATE OR REPLACE FUNCTION public.program_commercial_phase(_plan_id uuid, _day date DEFAULT CURRENT_DATE)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p record;
  v_ins_ini date; v_ins_fin date;
BEGIN
  SELECT * INTO p FROM public.planes WHERE id = _plan_id;
  IF p IS NULL THEN RETURN NULL; END IF;
  v_ins_ini := p.fecha_inicio_inscripcion;
  v_ins_fin := COALESCE(p.fecha_fin_inscripcion, p.fecha_cierre_inscripcion);
  IF p.fecha_inicio_preinscripcion IS NOT NULL AND p.fecha_fin_preinscripcion IS NOT NULL
     AND _day BETWEEN p.fecha_inicio_preinscripcion AND p.fecha_fin_preinscripcion THEN
    RETURN 'preinscripcion';
  END IF;
  IF v_ins_ini IS NOT NULL AND _day < v_ins_ini THEN
    IF p.fecha_fin_preinscripcion IS NOT NULL AND _day > p.fecha_fin_preinscripcion THEN
      RETURN 'espera_apertura';
    END IF;
    RETURN 'espera_apertura';
  END IF;
  IF (v_ins_ini IS NULL OR _day >= v_ins_ini) AND (v_ins_fin IS NULL OR _day <= v_ins_fin) THEN
    RETURN 'inscripcion';
  END IF;
  RETURN 'lista_espera';
END $$;

-- 6) get_public_program: mismas claves + fechas comerciales, fase y sedes
CREATE OR REPLACE FUNCTION public.get_public_program(_cohort_slug text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _plan record;
  _stages jsonb;
  _current jsonb;
  _cupos_libres int;
  _sedes jsonb;
BEGIN
  SELECT * INTO _plan FROM public.planes
  WHERE cohort_slug = _cohort_slug AND landing_public = true AND activo = true LIMIT 1;
  IF _plan IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'nombre', s.nombre, 'precio', s.precio, 'precio_cuota', s.precio_cuota,
    'cuotas_cantidad', s.cuotas_cantidad, 'fecha_desde', s.fecha_desde, 'fecha_hasta', s.fecha_hasta,
    'vigente', (CURRENT_DATE BETWEEN s.fecha_desde AND s.fecha_hasta)
  ) ORDER BY s.orden), '[]'::jsonb)
  INTO _stages FROM public.plan_price_stages s WHERE s.plan_id = _plan.id AND s.activo = true;

  SELECT to_jsonb(c) INTO _current FROM public.get_plan_current_price(_plan.id) c;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'sede_id', ps.sede_id, 'nombre', se.nombre, 'dia_semana', ps.dia_semana,
    'hora_inicio', ps.hora_inicio, 'hora_fin', ps.hora_fin, 'cupo_maximo', ps.cupo_maximo,
    'inscriptos', (SELECT count(*) FROM public.suscripciones su
                   WHERE su.plan_id = _plan.id AND su.programa_sede_id = ps.sede_id
                     AND su.estado IN ('activa','pendiente_pago','pendiente_verificacion'))
  ) ORDER BY se.nombre), '[]'::jsonb)
  INTO _sedes FROM public.planes_sedes ps JOIN public.sedes se ON se.id = ps.sede_id
  WHERE ps.plan_id = _plan.id AND ps.activa = true;

  _cupos_libres := GREATEST(0, COALESCE(_plan.max_inscripciones, 0) - COALESCE(_plan.inscripciones_actuales, 0));

  RETURN jsonb_build_object(
    'id', _plan.id, 'nombre', _plan.nombre, 'descripcion', _plan.descripcion,
    'cohort_slug', _plan.cohort_slug,
    'fecha_inicio_programa', _plan.fecha_inicio_programa, 'fecha_fin_programa', _plan.fecha_fin_programa,
    'fecha_cierre_inscripcion', _plan.fecha_cierre_inscripcion,
    'fecha_inicio_preinscripcion', _plan.fecha_inicio_preinscripcion,
    'fecha_fin_preinscripcion', _plan.fecha_fin_preinscripcion,
    'fecha_inicio_inscripcion', _plan.fecha_inicio_inscripcion,
    'fecha_fin_inscripcion', _plan.fecha_fin_inscripcion,
    'preinscripcion_slug', _plan.preinscripcion_slug,
    'fase_comercial', public.program_commercial_phase(_plan.id),
    'max_inscripciones', _plan.max_inscripciones, 'inscripciones_actuales', _plan.inscripciones_actuales,
    'cupos_libres', _cupos_libres, 'moneda', _plan.moneda, 'imagen_url', _plan.imagen_url,
    'features', _plan.features, 'stages', _stages, 'stage_vigente', _current,
    'sedes', _sedes
  );
END;
$function$;

-- 7) Alta pública a lista de espera de programa (único acceso anónimo)
CREATE OR REPLACE FUNCTION public.join_program_waitlist(
  _cohort_slug text, _sede_id uuid, _nombre text, _email text, _telefono text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_id uuid;
  v_nombre text := btrim(coalesce(_nombre, ''));
  v_email text := lower(btrim(coalesce(_email, '')));
  v_tel text := nullif(btrim(coalesce(_telefono, '')), '');
  v_has_sedes boolean;
BEGIN
  SELECT id INTO v_plan_id FROM public.planes
  WHERE cohort_slug = _cohort_slug AND landing_public = true AND activo = true LIMIT 1;
  IF v_plan_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_disponible'); END IF;
  IF length(v_nombre) < 2 OR length(v_nombre) > 120 THEN RETURN jsonb_build_object('ok', false, 'error', 'nombre'); END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 255 THEN RETURN jsonb_build_object('ok', false, 'error', 'email'); END IF;
  IF v_tel IS NOT NULL AND length(v_tel) > 40 THEN RETURN jsonb_build_object('ok', false, 'error', 'telefono'); END IF;

  SELECT EXISTS (SELECT 1 FROM public.planes_sedes WHERE plan_id = v_plan_id AND activa) INTO v_has_sedes;
  IF v_has_sedes THEN
    IF _sede_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.planes_sedes WHERE plan_id = v_plan_id AND sede_id = _sede_id AND activa) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'sede');
    END IF;
  ELSE
    _sede_id := NULL;
  END IF;

  INSERT INTO public.program_waitlist_entries (plan_id, sede_id, nombre, email, telefono)
  VALUES (v_plan_id, _sede_id, v_nombre, v_email, v_tel)
  ON CONFLICT (plan_id, COALESCE(sede_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email))
  DO UPDATE SET nombre = EXCLUDED.nombre, telefono = COALESCE(EXCLUDED.telefono, program_waitlist_entries.telefono), updated_at = now();

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.join_program_waitlist(text, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_program_waitlist(text, uuid, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.program_commercial_phase(uuid, date) TO anon, authenticated, service_role;