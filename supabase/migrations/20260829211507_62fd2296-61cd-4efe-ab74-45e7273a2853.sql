CREATE OR REPLACE FUNCTION public.get_staff_programs()
RETURNS TABLE (plan_id uuid, nombre text, alumnos_activos bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nombre, count(DISTINCT a.id)
  FROM public.planes p
  JOIN public.suscripciones s ON s.plan_id = p.id AND s.estado = 'activa'
  JOIN public.alumnos a ON a.id = s.alumno_id
       AND a.estado = 'activo'
       AND COALESCE(a.es_staff, false) = false
  WHERE p.es_programa_cerrado IS TRUE
    AND p.activo IS TRUE
    AND (
      public.has_role(auth.uid(), 'coach'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  GROUP BY p.id, p.nombre
  HAVING count(DISTINCT a.id) > 0
  ORDER BY p.nombre;
$$;

REVOKE ALL ON FUNCTION public.get_staff_programs() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_programs() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_staff_program_students(_plan_id uuid)
RETURNS TABLE (
  id uuid,
  nombre text,
  apellido text,
  grupo text,
  fecha_nacimiento date,
  es_staff boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT a.id, a.nombre, a.apellido, a.grupo::text, a.fecha_nacimiento, a.es_staff
  FROM public.alumnos a
  JOIN public.suscripciones s ON s.alumno_id = a.id
       AND s.plan_id = _plan_id
       AND s.estado = 'activa'
  JOIN public.planes p ON p.id = s.plan_id
       AND p.es_programa_cerrado IS TRUE
       AND p.activo IS TRUE
  WHERE a.estado = 'activo'
    AND COALESCE(a.es_staff, false) = false
    AND (
      public.has_role(auth.uid(), 'coach'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  ORDER BY a.nombre;
$$;

REVOKE ALL ON FUNCTION public.get_staff_program_students(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_program_students(uuid) TO authenticated;