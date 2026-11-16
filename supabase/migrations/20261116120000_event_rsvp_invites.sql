-- Fondazo / eventos informativos: invitaciones y confirmaciones por correo
-- Los tokens se usan exclusivamente desde una Edge Function con service-role.
-- La lectura administrativa pasa por esa función y valida user_roles.
CREATE TABLE IF NOT EXISTS public.event_rsvp_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  is_test boolean NOT NULL DEFAULT false,
  response text CHECK (response IN ('voy', 'no_voy')),
  participation_mode text CHECK (participation_mode IN ('fondo_y_almuerzo', 'solo_fondo', 'solo_almuerzo')),
  guests_count integer NOT NULL DEFAULT 0 CHECK (guests_count BETWEEN 0 AND 30),
  responded_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_rsvp_invites_unique_email UNIQUE (event_id, recipient_email),
  CONSTRAINT event_rsvp_mode_requires_yes CHECK (response = 'voy' OR participation_mode IS NULL),
  CONSTRAINT event_rsvp_guests_require_yes CHECK (response = 'voy' OR guests_count = 0)
);
CREATE INDEX IF NOT EXISTS idx_event_rsvp_invites_event ON public.event_rsvp_invites(event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvp_invites_alumno ON public.event_rsvp_invites(alumno_id);
ALTER TABLE public.event_rsvp_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_rsvp_invites FROM anon, authenticated;
COMMENT ON TABLE public.event_rsvp_invites IS 'Respuestas de asistencia a eventos informativos. Acceso únicamente por Edge Function validada, sin exposición de tokens en clientes administrativos.';
