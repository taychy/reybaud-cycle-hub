CREATE TABLE public.event_rsvp_pelotones (
  invite_id uuid PRIMARY KEY REFERENCES public.event_rsvp_invites(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  peloton text NOT NULL CHECK (peloton IN ('G1','G2','G3','G4','iniciacion','sin_asignar')),
  reason text NOT NULL,
  set_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.event_rsvp_peloton_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.event_rsvp_invites(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  from_peloton text,
  to_peloton text NOT NULL,
  reason text NOT NULL,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_rsvp_pelotones_event_idx ON public.event_rsvp_pelotones(event_id);
CREATE INDEX event_rsvp_peloton_audit_event_idx ON public.event_rsvp_peloton_audit(event_id, created_at DESC);
GRANT SELECT ON public.event_rsvp_pelotones TO authenticated;
GRANT SELECT ON public.event_rsvp_peloton_audit TO authenticated;
GRANT ALL ON public.event_rsvp_pelotones TO service_role;
GRANT ALL ON public.event_rsvp_peloton_audit TO service_role;
ALTER TABLE public.event_rsvp_pelotones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvp_peloton_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pelotones" ON public.event_rsvp_pelotones FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read peloton audit" ON public.event_rsvp_peloton_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_set_event_rsvp_peloton(p_invite_id uuid, p_peloton text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event uuid; v_prev text; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'Permisos de administración requeridos'; END IF;
  IF p_peloton NOT IN ('G1','G2','G3','G4','iniciacion','sin_asignar') THEN RAISE EXCEPTION 'Pelotón inválido'; END IF;
  IF length(trim(coalesce(p_reason,''))) < 3 THEN RAISE EXCEPTION 'Motivo obligatorio'; END IF;
  SELECT event_id INTO v_event FROM public.event_rsvp_invites WHERE id = p_invite_id AND is_test = false FOR UPDATE;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Participante no encontrado'; END IF;
  SELECT peloton INTO v_prev FROM public.event_rsvp_pelotones WHERE invite_id = p_invite_id;
  IF v_prev IS NOT DISTINCT FROM p_peloton THEN RETURN; END IF;
  INSERT INTO public.event_rsvp_pelotones(invite_id, event_id, peloton, reason, set_by, updated_at)
  VALUES (p_invite_id, v_event, p_peloton, trim(p_reason), v_uid, now())
  ON CONFLICT (invite_id) DO UPDATE SET peloton = EXCLUDED.peloton, reason = EXCLUDED.reason, set_by = EXCLUDED.set_by, updated_at = now();
  INSERT INTO public.event_rsvp_peloton_audit(invite_id, event_id, from_peloton, to_peloton, reason, actor_user_id)
  VALUES (p_invite_id, v_event, v_prev, p_peloton, trim(p_reason), v_uid);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_event_rsvp_peloton(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_event_rsvp_peloton(uuid, text, text) TO authenticated;