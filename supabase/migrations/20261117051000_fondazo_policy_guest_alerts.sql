-- Fondazo 29/11/2026: aceptación trazable y notificaciones idempotentes para Claudio.
-- No altera reservas ni cobros existentes.
CREATE TABLE IF NOT EXISTS public.event_rsvp_guest_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  invite_id uuid NOT NULL REFERENCES public.event_rsvp_invites(id) ON DELETE CASCADE,
  guest_key text NOT NULL CHECK (length(guest_key) BETWEEN 2 AND 100),
  guest_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invite_id, guest_key)
);
CREATE INDEX IF NOT EXISTS event_rsvp_guest_alerts_retry_idx
  ON public.event_rsvp_guest_alerts (invite_id, status, created_at);
ALTER TABLE public.event_rsvp_guest_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_rsvp_guest_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.event_rsvp_guest_alerts TO service_role;

CREATE OR REPLACE FUNCTION public.claim_event_rsvp_guest_alerts(p_invite_id uuid)
RETURNS SETOF public.event_rsvp_guest_alerts
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  WITH locked AS (
    SELECT id FROM public.event_rsvp_guest_alerts
    WHERE invite_id = p_invite_id
      AND attempts < 5
      AND (status IN ('pending', 'failed') OR
           (status = 'sending' AND last_attempt_at < now() - interval '10 minutes'))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10
  )
  UPDATE public.event_rsvp_guest_alerts alert
  SET status = 'sending', attempts = attempts + 1, last_attempt_at = now()
  FROM locked WHERE alert.id = locked.id RETURNING alert.*;
$$;
REVOKE ALL ON FUNCTION public.claim_event_rsvp_guest_alerts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_event_rsvp_guest_alerts(uuid) TO service_role;

-- Nueva RPC: conserva validaciones y conteos originales y registra el consentimiento
-- en la misma transacción que guarda la confirmación.
CREATE OR REPLACE FUNCTION public.respond_event_rsvp_with_guest_types_and_terms(
  p_token uuid, p_response text, p_mode text, p_cyclists jsonb,
  p_non_cyclists jsonb, p_accept_terms boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_event_id uuid;
  v_lunch boolean;
  v_policy text := 'Si cancelás hasta el viernes 27/11/2026 inclusive, lo abonado queda como crédito para consumir en La Carreta del Gato. Desde el sábado 28/11/2026, no hay devolución ni crédito.';
BEGIN
  SELECT event_id INTO v_event_id FROM public.event_rsvp_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enlace no encontrado.'; END IF;
  v_lunch := p_response = 'voy' AND p_mode IN ('fondo_y_almuerzo', 'solo_almuerzo');
  IF v_event_id = '08fc7e07-10df-4ace-b3ed-a0d581b6f7c9'::uuid
     AND v_lunch AND p_accept_terms IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Aceptá las condiciones del almuerzo para confirmar.';
  END IF;

  PERFORM public.respond_event_rsvp_with_guest_types(
    p_token, p_response, p_mode, p_cyclists, p_non_cyclists
  );

  IF v_event_id = '08fc7e07-10df-4ace-b3ed-a0d581b6f7c9'::uuid AND v_lunch THEN
    UPDATE public.event_rsvp_invites
    SET terms_version = 'fondazo-almuerzo-v2-2026-11-17',
        terms_accepted_at = now(),
        terms_text_snapshot = v_policy,
        updated_at = now()
    WHERE token = p_token;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.respond_event_rsvp_with_guest_types_and_terms(uuid,text,text,jsonb,jsonb,boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_event_rsvp_with_guest_types_and_terms(uuid,text,text,jsonb,jsonb,boolean)
  TO anon, authenticated, service_role;
