-- Multiple training venues per student, preserving alumnos.sede_id as primary venue.

CREATE TABLE IF NOT EXISTS public.alumno_sedes (
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  sede_id uuid NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
  es_principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alumno_id, sede_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS alumno_sedes_one_principal_idx
  ON public.alumno_sedes (alumno_id)
  WHERE es_principal = true;

ALTER TABLE public.alumno_sedes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage alumno_sedes" ON public.alumno_sedes;
CREATE POLICY "Admins can manage alumno_sedes"
ON public.alumno_sedes
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff can view alumno_sedes" ON public.alumno_sedes;
CREATE POLICY "Staff can view alumno_sedes"
ON public.alumno_sedes
FOR SELECT
USING (
  has_role(auth.uid(), 'coach'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Alumno can view own sedes" ON public.alumno_sedes;
CREATE POLICY "Alumno can view own sedes"
ON public.alumno_sedes
FOR SELECT
USING (alumno_id = current_alumno_id());

INSERT INTO public.alumno_sedes (alumno_id, sede_id, es_principal)
SELECT id, sede_id, true
FROM public.alumnos
WHERE sede_id IS NOT NULL
ON CONFLICT (alumno_id, sede_id)
DO UPDATE SET es_principal = EXCLUDED.es_principal;

CREATE OR REPLACE FUNCTION public.set_alumno_sedes(
  _alumno_id uuid,
  _sede_ids uuid[],
  _principal_id uuid DEFAULT NULL
)
RETURNS TABLE (sede_id uuid, es_principal boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_principal uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.alumnos WHERE id = _alumno_id) THEN
    RAISE EXCEPTION 'alumno_not_found';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), '{}'::uuid[])
  INTO v_ids
  FROM unnest(COALESCE(_sede_ids, '{}'::uuid[])) AS t(x)
  WHERE x IS NOT NULL;

  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) x
    WHERE NOT EXISTS (SELECT 1 FROM public.sedes s WHERE s.id = x)
  ) THEN
    RAISE EXCEPTION 'invalid_sede';
  END IF;

  IF cardinality(v_ids) = 0 THEN
    v_principal := NULL;
  ELSE
    v_principal := COALESCE(_principal_id, v_ids[1]);
    IF NOT (v_principal = ANY(v_ids)) THEN
      RAISE EXCEPTION 'principal_must_be_selected';
    END IF;
  END IF;

  DELETE FROM public.alumno_sedes a_s
  WHERE a_s.alumno_id = _alumno_id
    AND NOT (a_s.sede_id = ANY(v_ids));

  INSERT INTO public.alumno_sedes (alumno_id, sede_id, es_principal)
  SELECT _alumno_id, x, false
  FROM unnest(v_ids) x
  ON CONFLICT (alumno_id, sede_id) DO NOTHING;

  UPDATE public.alumno_sedes
  SET es_principal = false
  WHERE alumno_id = _alumno_id
    AND es_principal = true;

  IF v_principal IS NOT NULL THEN
    UPDATE public.alumno_sedes
    SET es_principal = true
    WHERE alumno_id = _alumno_id
      AND sede_id = v_principal;
  END IF;

  UPDATE public.alumnos
  SET sede_id = v_principal,
      updated_at = now()
  WHERE id = _alumno_id;

  RETURN QUERY
  SELECT a_s.sede_id, a_s.es_principal
  FROM public.alumno_sedes a_s
  WHERE a_s.alumno_id = _alumno_id
  ORDER BY a_s.es_principal DESC, a_s.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.set_alumno_sedes(uuid, uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_alumno_sedes(uuid, uuid[], uuid) TO authenticated;
