-- Acceso al formulario de asistencia desde la ficha pública del evento.
-- El asistente verifica su email por Supabase Auth; el token es personal y nunca
-- se comparte entre asistentes. No crea reservas ni cobros en Reybaud.
ALTER TABLE public.event_rsvp_invites
  ADD COLUMN IF NOT EXISTS participant_whatsapp text,
  ADD COLUMN IF NOT EXISTS registration_source text NOT NULL DEFAULT 'email';

CREATE OR REPLACE FUNCTION public.create_or_resume_public_rsvp(
  p_event_id uuid,
  p_first_name text,
  p_last_name text,
  p_whatsapp text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_verified timestamptz;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_phone text := regexp_replace(btrim(coalesce(p_whatsapp, '')), '[^0-9+]', '', 'g');
  v_alumno_id uuid;
  v_row_id uuid;
  v_token uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingresá con tu email para confirmar la asistencia.';
  END IF;
  SELECT lower(btrim(u.email)),u.email_confirmed_at
    INTO v_email,v_email_verified
  FROM auth.users u WHERE u.id=v_user_id;
  IF v_email IS NULL OR v_email_verified IS NULL THEN
    RAISE EXCEPTION 'Primero verificá tu email para continuar.';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.events e
    WHERE e.id=p_event_id AND e.status='publicado'
      AND e.estado_publicacion='publicado'
      AND e.visible_to_students=true AND e.is_active=true
      AND e.metadata->>'rsvp_enabled'='true'
      AND e.metadata->>'event_nature'='propio_informativo'
  ) THEN
    RAISE EXCEPTION 'La confirmación de asistencia no está disponible para este evento.';
  END IF;

  IF char_length(v_first) NOT BETWEEN 2 AND 70 OR char_length(v_last) NOT BETWEEN 2 AND 70 THEN
    RAISE EXCEPTION 'Completá tu nombre y apellido.';
  END IF;
  IF v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Ingresá tu WhatsApp con código de país, por ejemplo +54 9 11 1234 5678.';
  END IF;

  -- Sólo vincula una ficha de alumno coincidente con el usuario autenticado
  -- o con su correo verificado. No acredita automáticamente alumnos activos.
  SELECT a.id INTO v_alumno_id FROM public.alumnos a
  WHERE a.user_id=v_user_id OR lower(btrim(a.email))=v_email
  ORDER BY CASE WHEN a.user_id=v_user_id THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT i.id, i.token INTO v_row_id,v_token
  FROM public.event_rsvp_invites i
  WHERE i.event_id=p_event_id AND lower(btrim(i.recipient_email))=v_email
    AND i.is_test=false
  ORDER BY i.created_at ASC LIMIT 1 FOR UPDATE;

  IF v_row_id IS NOT NULL THEN
    UPDATE public.event_rsvp_invites
      SET recipient_name=v_first || ' ' || v_last,
          participant_whatsapp=v_phone,
          alumno_id=coalesce(alumno_id,v_alumno_id),
          registration_source='public_event',
          updated_at=now()
    WHERE id=v_row_id;
    RETURN v_token;
  END IF;

  INSERT INTO public.event_rsvp_invites
    (event_id,alumno_id,recipient_email,recipient_name,participant_whatsapp,is_test,registration_source)
  VALUES
    (p_event_id,v_alumno_id,v_email,v_first || ' ' || v_last,v_phone,false,'public_event')
  ON CONFLICT (event_id,recipient_email,is_test)
  DO UPDATE SET
    recipient_name=excluded.recipient_name,
    participant_whatsapp=excluded.participant_whatsapp,
    alumno_id=coalesce(public.event_rsvp_invites.alumno_id,excluded.alumno_id),
    registration_source='public_event',
    updated_at=now()
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_or_resume_public_rsvp(uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_or_resume_public_rsvp(uuid,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_or_resume_public_rsvp(uuid,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.create_or_resume_public_rsvp(uuid,text,text,text)
IS 'Un enlace único y real de asistencia por usuario de email verificado; no crea pagos.';
