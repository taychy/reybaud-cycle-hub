
-- =========================================================
-- BLOQUE B: Programa Iniciación 2026/2 - Infraestructura DB
-- =========================================================

-- 1) Marcar origen de cohort en alumnos (para métricas de retención)
ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS origen_cohort text,
  ADD COLUMN IF NOT EXISTS origen_cohort_fecha timestamptz;

CREATE INDEX IF NOT EXISTS alumnos_origen_cohort_idx ON public.alumnos(origen_cohort) WHERE origen_cohort IS NOT NULL;

-- 2) Extender planes para soportar "programa cerrado" con fechas fijas
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS es_programa_cerrado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_inicio_programa date,
  ADD COLUMN IF NOT EXISTS fecha_fin_programa date,
  ADD COLUMN IF NOT EXISTS fecha_cierre_inscripcion date,
  ADD COLUMN IF NOT EXISTS cohort_slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS landing_public boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS planes_cohort_slug_idx ON public.planes(cohort_slug) WHERE cohort_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS planes_landing_public_idx ON public.planes(landing_public) WHERE landing_public = true;

-- 3) Tabla de tramos de precio por fecha (para early bird / regular / última semana)
CREATE TABLE IF NOT EXISTS public.plan_price_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.planes(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  precio numeric NOT NULL,
  precio_cuota numeric,
  cuotas_cantidad int,
  fecha_desde date NOT NULL,
  fecha_hasta date NOT NULL,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plan_price_stages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_price_stages TO authenticated;
GRANT ALL ON public.plan_price_stages TO service_role;

ALTER TABLE public.plan_price_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_stages_public_read" ON public.plan_price_stages
  FOR SELECT USING (activo = true);

CREATE POLICY "price_stages_admin_all" ON public.plan_price_stages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX plan_price_stages_plan_id_idx ON public.plan_price_stages(plan_id);
CREATE INDEX plan_price_stages_fechas_idx ON public.plan_price_stages(fecha_desde, fecha_hasta);

CREATE TRIGGER plan_price_stages_updated_at
  BEFORE UPDATE ON public.plan_price_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Función helper: precio vigente para un plan HOY
CREATE OR REPLACE FUNCTION public.get_plan_current_price(_plan_id uuid)
RETURNS TABLE (
  stage_id uuid,
  stage_nombre text,
  precio numeric,
  precio_cuota numeric,
  cuotas_cantidad int,
  fecha_desde date,
  fecha_hasta date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, nombre, precio, precio_cuota, cuotas_cantidad, fecha_desde, fecha_hasta
  FROM public.plan_price_stages
  WHERE plan_id = _plan_id
    AND activo = true
    AND CURRENT_DATE BETWEEN fecha_desde AND fecha_hasta
  ORDER BY orden ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_plan_current_price(uuid) TO anon, authenticated;

-- 5) Función pública: obtener info completa del programa (para landing sin auth)
CREATE OR REPLACE FUNCTION public.get_public_program(_cohort_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan record;
  _stages jsonb;
  _current jsonb;
  _cupos_libres int;
BEGIN
  SELECT * INTO _plan
  FROM public.planes
  WHERE cohort_slug = _cohort_slug
    AND landing_public = true
    AND activo = true
  LIMIT 1;

  IF _plan IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'nombre', s.nombre,
    'precio', s.precio,
    'precio_cuota', s.precio_cuota,
    'cuotas_cantidad', s.cuotas_cantidad,
    'fecha_desde', s.fecha_desde,
    'fecha_hasta', s.fecha_hasta,
    'vigente', (CURRENT_DATE BETWEEN s.fecha_desde AND s.fecha_hasta)
  ) ORDER BY s.orden), '[]'::jsonb)
  INTO _stages
  FROM public.plan_price_stages s
  WHERE s.plan_id = _plan.id AND s.activo = true;

  SELECT to_jsonb(c) INTO _current
  FROM public.get_plan_current_price(_plan.id) c;

  _cupos_libres := GREATEST(0, COALESCE(_plan.max_inscripciones, 0) - COALESCE(_plan.inscripciones_actuales, 0));

  RETURN jsonb_build_object(
    'id', _plan.id,
    'nombre', _plan.nombre,
    'descripcion', _plan.descripcion,
    'cohort_slug', _plan.cohort_slug,
    'fecha_inicio_programa', _plan.fecha_inicio_programa,
    'fecha_fin_programa', _plan.fecha_fin_programa,
    'fecha_cierre_inscripcion', _plan.fecha_cierre_inscripcion,
    'max_inscripciones', _plan.max_inscripciones,
    'inscripciones_actuales', _plan.inscripciones_actuales,
    'cupos_libres', _cupos_libres,
    'moneda', _plan.moneda,
    'imagen_url', _plan.imagen_url,
    'features', _plan.features,
    'stages', _stages,
    'stage_vigente', _current
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_program(text) TO anon, authenticated;

COMMENT ON COLUMN public.alumnos.origen_cohort IS 'Slug del programa/cohort por el cual ingresó el alumno (ej: formacion_inicial_2026_2). Se usa para métricas de retención.';
COMMENT ON COLUMN public.planes.es_programa_cerrado IS 'true = programa con fechas fijas, no renovable, oculto del catálogo regular.';
COMMENT ON COLUMN public.planes.landing_public IS 'true = tiene landing page pública propia (ej: /formacion-inicial).';
COMMENT ON TABLE public.plan_price_stages IS 'Tramos de precio por fecha para planes/programas (early bird, regular, última semana).';
