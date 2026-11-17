-- Fondazo: mostrar respuestas de prueba solo a administradores,
-- sin mezclarlas con estadísticas, invitados reales ni campañas.
CREATE OR REPLACE FUNCTION public.get_event_rsvp_test_rows_admin(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'recipient_name', i.recipient_name,
        'recipient_email', i.recipient_email,
        'response', i.response,
        'participation_mode', i.participation_mode,
        'cyclist_guests', i.cyclist_guests,
        'non_cyclist_guests', i.non_cyclist_guests,
        'responded_at', i.responded_at
      ) ORDER BY i.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.event_rsvp_invites AS i
  WHERE i.event_id = p_event_id AND i.is_test = true;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_event_rsvp_test_rows_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_rsvp_test_rows_admin(uuid) TO authenticated;
