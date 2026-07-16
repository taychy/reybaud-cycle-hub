
-- ============================================================
-- 1. Contador real de inscriptos por plan
-- ============================================================

CREATE OR REPLACE VIEW public.planes_con_inscriptos AS
SELECT
  p.*,
  COALESCE((
    SELECT COUNT(*)::int
    FROM public.suscripciones s
    WHERE s.plan_id = p.id
      AND s.estado IN ('activa','pendiente_pago','pendiente_verificacion')
  ), 0) AS inscriptos_reales
FROM public.planes p;

GRANT SELECT ON public.planes_con_inscriptos TO anon, authenticated;

-- Trigger para mantener planes.inscripciones_actuales sincronizado
CREATE OR REPLACE FUNCTION public.sync_plan_inscripciones_actuales()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_ids uuid[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_plan_ids := ARRAY[OLD.plan_id];
  ELSIF TG_OP = 'INSERT' THEN
    v_plan_ids := ARRAY[NEW.plan_id];
  ELSE
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
      v_plan_ids := ARRAY[NEW.plan_id, OLD.plan_id];
    ELSE
      v_plan_ids := ARRAY[NEW.plan_id];
    END IF;
  END IF;

  UPDATE public.planes p
  SET inscripciones_actuales = COALESCE((
    SELECT COUNT(*)
    FROM public.suscripciones s
    WHERE s.plan_id = p.id
      AND s.estado IN ('activa','pendiente_pago','pendiente_verificacion')
  ), 0)
  WHERE p.id = ANY(v_plan_ids);

  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_sync_plan_inscripciones ON public.suscripciones;
CREATE TRIGGER trg_sync_plan_inscripciones
AFTER INSERT OR UPDATE OR DELETE ON public.suscripciones
FOR EACH ROW EXECUTE FUNCTION public.sync_plan_inscripciones_actuales();

-- Seed inicial para reparar contadores viejos
UPDATE public.planes p
SET inscripciones_actuales = COALESCE((
  SELECT COUNT(*)
  FROM public.suscripciones s
  WHERE s.plan_id = p.id
    AND s.estado IN ('activa','pendiente_pago','pendiente_verificacion')
), 0);

-- ============================================================
-- 2. marketing_contacts: link a alumno + flag secundario + sync
-- ============================================================

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS es_email_secundario boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_alumno_id ON public.marketing_contacts(alumno_id);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_email_lower ON public.marketing_contacts(LOWER(email));

CREATE OR REPLACE FUNCTION public.sync_alumno_to_marketing_contacts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
  v_extra text;
BEGIN
  -- Email primario
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    v_email := LOWER(TRIM(NEW.email));
    INSERT INTO public.marketing_contacts (email, nombre, apellido, telefono, alumno_id, es_email_secundario)
    VALUES (v_email, NEW.nombre, NEW.apellido, NEW.telefono, NEW.id, false)
    ON CONFLICT (email) DO UPDATE
      SET alumno_id = EXCLUDED.alumno_id,
          es_email_secundario = false,
          nombre = COALESCE(EXCLUDED.nombre, public.marketing_contacts.nombre),
          apellido = COALESCE(EXCLUDED.apellido, public.marketing_contacts.apellido),
          telefono = COALESCE(EXCLUDED.telefono, public.marketing_contacts.telefono);
  END IF;

  -- Emails secundarios
  IF NEW.emails_adicionales IS NOT NULL THEN
    FOREACH v_extra IN ARRAY NEW.emails_adicionales LOOP
      IF v_extra IS NULL OR v_extra = '' THEN CONTINUE; END IF;
      v_extra := LOWER(TRIM(v_extra));
      INSERT INTO public.marketing_contacts (email, nombre, apellido, telefono, alumno_id, es_email_secundario)
      VALUES (v_extra, NEW.nombre, NEW.apellido, NEW.telefono, NEW.id, true)
      ON CONFLICT (email) DO UPDATE
        SET alumno_id = EXCLUDED.alumno_id,
            es_email_secundario = true,
            nombre = COALESCE(EXCLUDED.nombre, public.marketing_contacts.nombre),
            apellido = COALESCE(EXCLUDED.apellido, public.marketing_contacts.apellido),
            telefono = COALESCE(EXCLUDED.telefono, public.marketing_contacts.telefono);
    END LOOP;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_alumno_marketing ON public.alumnos;
CREATE TRIGGER trg_sync_alumno_marketing
AFTER INSERT OR UPDATE OF email, emails_adicionales, nombre, apellido, telefono ON public.alumnos
FOR EACH ROW EXECUTE FUNCTION public.sync_alumno_to_marketing_contacts();

-- ============================================================
-- 3. Fusión de fichas de alumno
-- ============================================================

ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS fusionada_en uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fusionada_at timestamptz;

CREATE OR REPLACE FUNCTION public.merge_alumnos(_ganador uuid, _perdedor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ganador public.alumnos%ROWTYPE;
  v_perdedor public.alumnos%ROWTYPE;
  v_new_extras text[];
  v_moved jsonb := '{}'::jsonb;
  v_tbl text;
  v_count int;
BEGIN
  -- Autorización: solo admin o super_admin
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF _ganador = _perdedor THEN
    RAISE EXCEPTION 'Ganador y perdedor deben ser distintos';
  END IF;

  SELECT * INTO v_ganador FROM public.alumnos WHERE id = _ganador FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alumno ganador no existe'; END IF;
  SELECT * INTO v_perdedor FROM public.alumnos WHERE id = _perdedor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alumno perdedor no existe'; END IF;

  IF v_perdedor.estado = 'fusionada' THEN
    RAISE EXCEPTION 'La ficha perdedora ya fue fusionada';
  END IF;

  -- 1) Consolidar emails: email perdedora + sus adicionales pasan a emails_adicionales del ganador
  v_new_extras := COALESCE(v_ganador.emails_adicionales, ARRAY[]::text[]);
  IF v_perdedor.email IS NOT NULL AND v_perdedor.email <> ''
     AND LOWER(v_perdedor.email) <> LOWER(COALESCE(v_ganador.email,''))
     AND NOT (LOWER(v_perdedor.email) = ANY(SELECT LOWER(x) FROM unnest(v_new_extras) x)) THEN
    v_new_extras := v_new_extras || v_perdedor.email;
  END IF;
  IF v_perdedor.emails_adicionales IS NOT NULL THEN
    v_new_extras := v_new_extras || (
      SELECT COALESCE(array_agg(e), ARRAY[]::text[])
      FROM unnest(v_perdedor.emails_adicionales) e
      WHERE LOWER(e) <> LOWER(COALESCE(v_ganador.email,''))
        AND NOT (LOWER(e) = ANY(SELECT LOWER(x) FROM unnest(v_new_extras) x))
    );
  END IF;

  -- 2) Transferir user_id si el ganador no tiene
  UPDATE public.alumnos
  SET emails_adicionales = v_new_extras,
      user_id = COALESCE(v_ganador.user_id, v_perdedor.user_id),
      telefono = COALESCE(v_ganador.telefono, v_perdedor.telefono),
      documento = COALESCE(v_ganador.documento, v_perdedor.documento)
  WHERE id = _ganador;

  -- 3) Reasignar relaciones (best-effort por tabla si existe la columna alumno_id)
  FOR v_tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'alumno_id'
      AND table_name NOT IN ('alumnos')
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET alumno_id = $1 WHERE alumno_id = $2',
      v_tbl
    ) USING _ganador, _perdedor;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_moved := v_moved || jsonb_build_object(v_tbl, v_count);
    END IF;
  END LOOP;

  -- 4) marketing_contacts: reasignar y marcar como secundario el email de la perdedora
  UPDATE public.marketing_contacts
  SET alumno_id = _ganador,
      es_email_secundario = CASE
        WHEN LOWER(email) = LOWER(COALESCE(v_ganador.email,'')) THEN false
        ELSE true
      END
  WHERE alumno_id = _perdedor
     OR LOWER(email) = LOWER(COALESCE(v_perdedor.email,''));

  -- 5) Soft-delete: marcar la ficha perdedora como fusionada
  UPDATE public.alumnos
  SET estado = 'fusionada',
      fusionada_en = _ganador,
      fusionada_at = now(),
      user_id = NULL
  WHERE id = _perdedor;

  RETURN jsonb_build_object(
    'ok', true,
    'ganador', _ganador,
    'perdedor', _perdedor,
    'moved', v_moved,
    'emails_finales', v_new_extras
  );
END; $$;

REVOKE ALL ON FUNCTION public.merge_alumnos(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_alumnos(uuid, uuid) TO authenticated;
