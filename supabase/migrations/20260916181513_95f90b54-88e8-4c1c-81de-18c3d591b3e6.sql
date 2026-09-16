CREATE OR REPLACE FUNCTION public.alumno_puede_ver_entrenamientos(_alumno_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.alumnos a
    WHERE a.id = _alumno_id
      AND a.estado IN ('activo', 'vacaciones')
      AND EXISTS (
        SELECT 1 FROM public.suscripciones s
        WHERE s.alumno_id = a.id
          AND s.cancelada_at IS NULL
          AND s.estado IN ('activa', 'pendiente_verificacion', 'pendiente', 'vencida')
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.alumno_puede_ver_entrenamientos(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Students can view their group entrenamientos" ON public.entrenamientos;
CREATE POLICY "Students can view their group entrenamientos"
ON public.entrenamientos
FOR SELECT
TO authenticated
USING (
  alumno_id IS NULL
  AND visible = true
  AND EXISTS (
    SELECT 1 FROM public.alumnos a
    WHERE a.user_id = auth.uid()
      AND a.grupo = entrenamientos.grupo
      AND public.alumno_puede_ver_entrenamientos(a.id)
  )
);

DROP POLICY IF EXISTS "Students can view own personal entrenamientos" ON public.entrenamientos;
CREATE POLICY "Students can view own personal entrenamientos"
ON public.entrenamientos
FOR SELECT
TO authenticated
USING (
  alumno_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.alumnos a
    WHERE a.user_id = auth.uid()
      AND a.id = entrenamientos.alumno_id
      AND public.alumno_puede_ver_entrenamientos(a.id)
  )
);

CREATE OR REPLACE FUNCTION public.get_entrenamientos_semana_alumno(_alumno_id uuid, _desde date, _hasta date)
 RETURNS TABLE(id uuid, fecha date, titulo text, descripcion text, tipo tipo_entrenamiento, grupo grupo_ciclismo, link_archivo text, resistencia text, tecnica text, intensidad text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _grupo public.grupo_ciclismo;
  _user_id uuid;
BEGIN
  SELECT a.grupo, a.user_id INTO _grupo, _user_id
  FROM public.alumnos a WHERE a.id = _alumno_id;

  IF _grupo IS NULL AND _user_id IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND (_user_id IS NULL OR _user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT public.alumno_puede_ver_entrenamientos(_alumno_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT e.id, e.fecha, e.titulo, e.descripcion, e.tipo, e.grupo,
         e.link_archivo,
         e.resistencia::text,
         e.tecnica::text,
         e.intensidad::text
  FROM public.entrenamientos e
  WHERE e.visible = true
    AND e.fecha >= _desde
    AND e.fecha <= _hasta
    AND (
      CASE WHEN _grupo IN ('Personalizado','Aspirantes')
        THEN e.alumno_id = _alumno_id
        ELSE e.grupo = _grupo AND e.alumno_id IS NULL
      END
    )
  ORDER BY e.fecha ASC;
END;
$function$;