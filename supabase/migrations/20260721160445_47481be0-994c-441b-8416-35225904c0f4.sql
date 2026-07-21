-- Marcar entradas de lista de espera como vistas por admin
ALTER TABLE public.event_waitlist_entries
  ADD COLUMN IF NOT EXISTS admin_visto_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_event_waitlist_entries_admin_visto
  ON public.event_waitlist_entries (admin_visto_at)
  WHERE admin_visto_at IS NULL;

-- Contador actualizado: solo nuevas no vistas
CREATE OR REPLACE FUNCTION public.count_new_waitlist_entries()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::integer
    FROM public.event_waitlist_entries
   WHERE estado = 'nuevo'
     AND admin_visto_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.count_new_waitlist_entries() TO authenticated;

-- Marcar todas las entradas nuevas como vistas
CREATE OR REPLACE FUNCTION public.mark_waitlist_entries_seen()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN 0;
  END IF;
  UPDATE public.event_waitlist_entries
     SET admin_visto_at = now()
   WHERE admin_visto_at IS NULL
     AND estado = 'nuevo';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_waitlist_entries_seen() TO authenticated;

-- Marcar como vistas las entradas de una plantilla específica
CREATE OR REPLACE FUNCTION public.mark_waitlist_entries_seen_for_template(p_template_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_question_ids text[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(
           ARRAY(SELECT jsonb_array_elements(preguntas)->>'id'
                   FROM public.waitlist_question_templates
                  WHERE id = p_template_id),
           ARRAY[]::text[])
    INTO v_question_ids;

  IF v_question_ids IS NULL OR array_length(v_question_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.event_waitlist_entries e
     SET admin_visto_at = now()
   WHERE admin_visto_at IS NULL
     AND estado = 'nuevo'
     AND EXISTS (
       SELECT 1 FROM jsonb_object_keys(e.respuestas) k
        WHERE k = ANY (v_question_ids)
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_waitlist_entries_seen_for_template(uuid) TO authenticated;