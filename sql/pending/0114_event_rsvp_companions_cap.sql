-- PENDIENTE DE AUTORIZACIÓN: no aplicado. Quita el cupo comercial de 30 acompañantes
-- del RSVP (solo tablas/funciones event_rsvp_*). Deja un control técnico anti-abuso (500).
ALTER TABLE public.event_rsvp_invites
  DROP CONSTRAINT IF EXISTS event_rsvp_invites_guests_count_check,
  DROP CONSTRAINT IF EXISTS event_rsvp_invites_adults_count_check,
  DROP CONSTRAINT IF EXISTS event_rsvp_invites_children_4_9_count_check,
  DROP CONSTRAINT IF EXISTS event_rsvp_invites_under_4_count_check;
ALTER TABLE public.event_rsvp_invites
  ADD CONSTRAINT event_rsvp_invites_guests_count_check CHECK (guests_count BETWEEN 0 AND 500),
  ADD CONSTRAINT event_rsvp_invites_adults_count_check CHECK (adults_count BETWEEN 0 AND 501),
  ADD CONSTRAINT event_rsvp_invites_children_4_9_count_check CHECK (children_4_9_count BETWEEN 0 AND 501),
  ADD CONSTRAINT event_rsvp_invites_under_4_count_check CHECK (under_4_count BETWEEN 0 AND 501);
-- Además: en respond_event_rsvp reemplazar "p_guests_count > 30" por "> 500" y en
-- confirm_event_rsvp_lunch los "> 30" por "> 501" (CREATE OR REPLACE con el cuerpo de 0113).
