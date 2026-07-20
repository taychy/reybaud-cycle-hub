
-- 1) Turnera: marcador "visto por admin"
ALTER TABLE public.reservas_turnera
  ADD COLUMN IF NOT EXISTS admin_visto_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_reservas_turnera_admin_visto
  ON public.reservas_turnera (admin_visto_at)
  WHERE admin_visto_at IS NULL;

-- Counter para el badge en la sidebar
CREATE OR REPLACE FUNCTION public.count_new_turnera_reservations()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::integer
    FROM public.reservas_turnera
   WHERE admin_visto_at IS NULL
     AND estado_operativo IN ('reservada','realizada')
$$;

GRANT EXECUTE ON FUNCTION public.count_new_turnera_reservations() TO authenticated;

-- Marcar todas como vistas (al ingresar admin a la turnera)
CREATE OR REPLACE FUNCTION public.mark_turnera_reservations_seen()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN 0;
  END IF;
  UPDATE public.reservas_turnera
     SET admin_visto_at = now()
   WHERE admin_visto_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_turnera_reservations_seen() TO authenticated;

-- 2) Respuestas por plantilla de lista de espera
CREATE OR REPLACE FUNCTION public.get_waitlist_entries_for_template(p_template_id uuid)
RETURNS TABLE (
  entry_id uuid,
  event_id uuid,
  event_title text,
  nombre text,
  email text,
  telefono text,
  dni text,
  estado text,
  respuestas jsonb,
  created_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_question_ids text[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN;
  END IF;

  SELECT COALESCE(
           ARRAY(SELECT jsonb_array_elements(preguntas)->>'id'
                   FROM public.waitlist_question_templates
                  WHERE id = p_template_id),
           ARRAY[]::text[])
    INTO v_question_ids;

  IF v_question_ids IS NULL OR array_length(v_question_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT e.id, e.event_id,
           COALESCE(ev.title, '(evento eliminado)') AS event_title,
           e.nombre, e.email, e.telefono, e.dni, e.estado,
           e.respuestas, e.created_at
      FROM public.event_waitlist_entries e
      LEFT JOIN public.events ev ON ev.id = e.event_id
     WHERE EXISTS (
       SELECT 1 FROM jsonb_object_keys(e.respuestas) k
        WHERE k = ANY (v_question_ids)
     )
     ORDER BY e.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_waitlist_entries_for_template(uuid) TO authenticated;
