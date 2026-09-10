-- Fix weekly training preview RPC after resistencia/tecnica/intensidad changed to smallint.
-- The RPC contract returns those fields as text for the email renderer, so cast explicitly.
CREATE OR REPLACE FUNCTION public.get_entrenamientos_semana_alumno(
  _alumno_id uuid,
  _desde date,
  _hasta date
)
RETURNS TABLE(
  id uuid,
  fecha date,
  titulo text,
  descripcion text,
  tipo tipo_entrenamiento,
  grupo grupo_ciclismo,
  link_archivo text,
  resistencia text,
  tecnica text,
  intensidad text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _grupo public.grupo_ciclismo;
  _user_id uuid;
BEGIN
  SELECT a.grupo, a.user_id
  INTO _grupo, _user_id
  FROM public.alumnos a
  WHERE a.id = _alumno_id;

  IF _grupo IS NULL AND _user_id IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND (_user_id IS NULL OR _user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.fecha,
    e.titulo,
    e.descripcion,
    e.tipo,
    e.grupo,
    e.link_archivo,
    e.resistencia::text,
    e.tecnica::text,
    e.intensidad::text
  FROM public.entrenamientos e
  WHERE e.visible = true
    AND e.fecha >= _desde
    AND e.fecha <= _hasta
    AND (
      CASE
        WHEN _grupo IN ('Personalizado', 'Aspirantes')
          THEN e.alumno_id = _alumno_id
        ELSE e.grupo = _grupo AND e.alumno_id IS NULL
      END
    )
  ORDER BY e.fecha ASC;
END;
$function$;
