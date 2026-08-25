CREATE OR REPLACE FUNCTION public.link_turnera_alumno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_doc text;
  v_ids uuid[];
BEGIN
  IF NEW.alumno_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.alumno_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_email := NULLIF(lower(trim(COALESCE(NEW.email, ''))), '');
  v_doc := NULLIF(regexp_replace(COALESCE(NEW.documento, ''), '[^0-9]', '', 'g'), '');

  IF v_email IS NOT NULL THEN
    SELECT array_agg(DISTINCT a.id) INTO v_ids
    FROM public.alumnos a
    WHERE lower(trim(COALESCE(a.email, ''))) = v_email
       OR EXISTS (
         SELECT 1 FROM unnest(COALESCE(a.emails_adicionales, ARRAY[]::text[])) ea
          WHERE lower(trim(ea)) = v_email
       );
    IF array_length(v_ids, 1) = 1 THEN
      NEW.alumno_id := v_ids[1];
      RETURN NEW;
    ELSIF COALESCE(array_length(v_ids, 1), 0) > 1 THEN
      RETURN NEW; -- ambiguo: no autoasignar
    END IF;
  END IF;

  IF v_doc IS NOT NULL AND length(v_doc) >= 7 THEN
    SELECT array_agg(DISTINCT a.id) INTO v_ids
    FROM public.alumnos a
    WHERE NULLIF(regexp_replace(COALESCE(a.documento, ''), '[^0-9]', '', 'g'), '') = v_doc;
    IF array_length(v_ids, 1) = 1 THEN
      NEW.alumno_id := v_ids[1];
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.link_turnera_alumno() FROM anon, authenticated;