
-- Extend reservation_roommates for invitation flow
ALTER TABLE public.reservation_roommates
  ADD COLUMN IF NOT EXISTS invited_by_alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;

DO $$ BEGIN
  ALTER TABLE public.reservation_roommates
    ADD CONSTRAINT reservation_roommates_status_check
    CHECK (status IN ('pending','accepted','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill event_id where possible
UPDATE public.reservation_roommates rr
SET event_id = r.event_id
FROM public.event_reservations r
WHERE rr.reservation_id = r.id AND rr.event_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_roommates_event ON public.reservation_roommates(event_id);
CREATE INDEX IF NOT EXISTS idx_roommates_status ON public.reservation_roommates(status);

-- Allow authenticated user to read invitations where they are the invited email
DROP POLICY IF EXISTS "Invited user reads own invitations" ON public.reservation_roommates;
CREATE POLICY "Invited user reads own invitations"
  ON public.reservation_roommates FOR SELECT TO authenticated
  USING (
    email IS NOT NULL AND lower(email) = lower(auth.email())
  );

-- RPC: list event participants eligible for roommate invite
CREATE OR REPLACE FUNCTION public.list_event_participants_for_roommate(_event_id uuid)
RETURNS TABLE (
  alumno_id uuid,
  nombre text,
  email text,
  reservation_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, coalesce(a.nombre, a.email), a.email, r.id
  FROM public.event_reservations r
  JOIN public.alumnos a ON a.id = r.alumno_id
  WHERE r.event_id = _event_id
    AND r.reservation_status NOT IN ('cancelled','rejected','expired')
    AND a.email IS NOT NULL
    AND lower(a.email) <> lower(coalesce(auth.email(),''))
  ORDER BY a.nombre NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.list_event_participants_for_roommate(uuid) TO authenticated;

-- RPC: accept a roommate invitation
CREATE OR REPLACE FUNCTION public.accept_roommate_invitation(_roommate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.reservation_roommates%ROWTYPE;
  v_email text := auth.email();
  v_my_alumno_id uuid;
  v_my_reservation_id uuid;
  v_inviter_reservation public.event_reservations%ROWTYPE;
  v_next_pos int;
BEGIN
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_row FROM public.reservation_roommates WHERE id = _roommate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF lower(coalesce(v_row.email,'')) <> lower(v_email) THEN
    RAISE EXCEPTION 'not_invited';
  END IF;

  IF v_row.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  -- Update invitation to accepted
  UPDATE public.reservation_roommates
  SET status = 'accepted', confirmado = true, updated_at = now()
  WHERE id = _roommate_id;

  -- Find my alumno + reservation on same event as the inviter
  SELECT * INTO v_inviter_reservation FROM public.event_reservations WHERE id = v_row.reservation_id;

  SELECT a.id INTO v_my_alumno_id FROM public.alumnos a WHERE lower(a.email) = lower(v_email) LIMIT 1;
  IF v_my_alumno_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'mirrored', false);
  END IF;

  SELECT id INTO v_my_reservation_id
  FROM public.event_reservations
  WHERE event_id = v_inviter_reservation.event_id AND alumno_id = v_my_alumno_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_my_reservation_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'mirrored', false);
  END IF;

  -- Create mirror row on the invitee's reservation pointing back to the inviter (if not already)
  IF NOT EXISTS (
    SELECT 1 FROM public.reservation_roommates
    WHERE reservation_id = v_my_reservation_id AND alumno_id = v_inviter_reservation.alumno_id
  ) THEN
    SELECT coalesce(max(posicion),0)+1 INTO v_next_pos FROM public.reservation_roommates WHERE reservation_id = v_my_reservation_id;
    INSERT INTO public.reservation_roommates (
      reservation_id, posicion, nombre, email, alumno_id, status, confirmado, invited_by_alumno_id, event_id
    )
    SELECT v_my_reservation_id, v_next_pos, coalesce(a.nombre, a.email), a.email, a.id, 'accepted', true, v_my_alumno_id, v_inviter_reservation.event_id
    FROM public.alumnos a WHERE a.id = v_inviter_reservation.alumno_id;
  ELSE
    UPDATE public.reservation_roommates
    SET status = 'accepted', confirmado = true, updated_at = now()
    WHERE reservation_id = v_my_reservation_id AND alumno_id = v_inviter_reservation.alumno_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'mirrored', true, 'reservation_id', v_my_reservation_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_roommate_invitation(uuid) TO authenticated;

-- RPC: reject invitation
CREATE OR REPLACE FUNCTION public.reject_roommate_invitation(_roommate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email text := auth.email(); v_row public.reservation_roommates%ROWTYPE;
BEGIN
  IF v_email IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_row FROM public.reservation_roommates WHERE id = _roommate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF lower(coalesce(v_row.email,'')) <> lower(v_email) THEN RAISE EXCEPTION 'not_invited'; END IF;
  UPDATE public.reservation_roommates SET status = 'rejected', confirmado = false, updated_at = now() WHERE id = _roommate_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_roommate_invitation(uuid) TO authenticated;
