
-- 1. Schema event_reservations
ALTER TABLE public.event_reservations
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS checkin_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_email text,
  ADD COLUMN IF NOT EXISTS external_first_name text,
  ADD COLUMN IF NOT EXISTS external_last_name text,
  ADD COLUMN IF NOT EXISTS external_team_name text,
  ADD COLUMN IF NOT EXISTS event_participant_id uuid;

-- 2. Schema event_participants
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS event_reservation_id uuid;

ALTER TABLE public.event_participants
  ALTER COLUMN checked_in_at DROP NOT NULL;

-- Reemplazar unique (event_slug, email) por (event_id, lower(email))
ALTER TABLE public.event_participants
  DROP CONSTRAINT IF EXISTS event_participants_event_slug_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS event_participants_event_id_email_uniq
  ON public.event_participants (event_id, lower(email))
  WHERE event_id IS NOT NULL;

-- FKs
DO $$ BEGIN
  ALTER TABLE public.event_participants
    ADD CONSTRAINT event_participants_event_reservation_id_fkey
    FOREIGN KEY (event_reservation_id) REFERENCES public.event_reservations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.event_reservations
    ADD CONSTRAINT event_reservations_event_participant_id_fkey
    FOREIGN KEY (event_participant_id) REFERENCES public.event_participants(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. UNIQUE event_reservations: rígida -> parcial
ALTER TABLE public.event_reservations
  DROP CONSTRAINT IF EXISTS event_reservations_event_id_alumno_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS event_reservations_event_alumno_active_uniq
  ON public.event_reservations (event_id, alumno_id)
  WHERE alumno_id IS NOT NULL AND cancelled_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_reservations_event_external_email_active_uniq
  ON public.event_reservations (event_id, lower(external_email))
  WHERE external_email IS NOT NULL AND cancelled_at IS NULL;

-- 4a. MARZO: 44 con alumno
WITH ep_with_alumno AS (
  SELECT ep.id AS ep_id, ep.checked_in_at, a.id AS alumno_id
  FROM public.event_participants ep
  JOIN public.alumnos a ON lower(a.email) = lower(ep.email)
  WHERE ep.event_id = 'bec6fdcd-001a-4de8-a70b-164019e7b7a2'
    AND ep.event_reservation_id IS NULL
), inserted AS (
  INSERT INTO public.event_reservations (
    event_id, alumno_id, estado, reservation_status, payment_status,
    metodo_pago, moneda, amount_paid,
    origin, checkin_at, confirmed_at, accepted_terms, created_by,
    event_participant_id, created_at, updated_at
  )
  SELECT
    'bec6fdcd-001a-4de8-a70b-164019e7b7a2', e.alumno_id,
    'reserva_confirmada', 'reserva_confirmada', 'no_aplica',
    'efectivo', 'ARS', 0,
    'legacy_migration_marzo', e.checked_in_at, e.checked_in_at, true, 'legacy',
    e.ep_id, e.checked_in_at, now()
  FROM ep_with_alumno e
  RETURNING id, event_participant_id
)
UPDATE public.event_participants ep
   SET event_reservation_id = i.id
  FROM inserted i
 WHERE ep.id = i.event_participant_id;

-- 4b. MARZO: 7 externos
DO $$
DECLARE
  r RECORD;
  v_eep_id uuid;
  v_res_id uuid;
BEGIN
  FOR r IN
    SELECT ep.id AS ep_id, ep.email, ep.first_name, ep.last_name, ep.team_name, ep.checked_in_at
    FROM public.event_participants ep
    LEFT JOIN public.alumnos a ON lower(a.email) = lower(ep.email)
    WHERE ep.event_id = 'bec6fdcd-001a-4de8-a70b-164019e7b7a2'
      AND a.id IS NULL
      AND ep.event_reservation_id IS NULL
  LOOP
    SELECT id INTO v_eep_id
      FROM public.event_external_participants
     WHERE lower(email) = lower(r.email)
     LIMIT 1;

    IF v_eep_id IS NULL THEN
      INSERT INTO public.event_external_participants (nombre, apellido, email, estado, notas)
      VALUES (r.first_name, r.last_name, lower(r.email), 'activo',
              'Migrado desde Record de la Hora marzo 2026')
      RETURNING id INTO v_eep_id;
    END IF;

    INSERT INTO public.event_reservations (
      event_id, alumno_id, external_participant_id,
      external_email, external_first_name, external_last_name, external_team_name,
      estado, reservation_status, payment_status,
      metodo_pago, moneda, amount_paid,
      origin, checkin_at, confirmed_at, accepted_terms, created_by,
      event_participant_id, created_at, updated_at
    ) VALUES (
      'bec6fdcd-001a-4de8-a70b-164019e7b7a2', NULL, v_eep_id,
      lower(r.email), r.first_name, r.last_name, r.team_name,
      'reserva_confirmada', 'reserva_confirmada', 'no_aplica',
      'efectivo', 'ARS', 0,
      'legacy_migration_marzo', r.checked_in_at, r.checked_in_at, true, 'legacy',
      r.ep_id, r.checked_in_at, now()
    ) RETURNING id INTO v_res_id;

    UPDATE public.event_participants SET event_reservation_id = v_res_id WHERE id = r.ep_id;
  END LOOP;
END $$;

-- 5. MAYO: 2 reservas -> participaciones auxiliares
DO $$
DECLARE
  r RECORD;
  v_alumno RECORD;
  v_ep_id uuid;
BEGIN
  FOR r IN
    SELECT id AS res_id, alumno_id
    FROM public.event_reservations
    WHERE event_id = '62a29493-7c8a-474a-a509-7224a8fb0cd7'
      AND event_participant_id IS NULL
  LOOP
    SELECT nombre, apellido, email INTO v_alumno
      FROM public.alumnos WHERE id = r.alumno_id;

    INSERT INTO public.event_participants (
      event_id, event_slug,
      first_name, last_name, email, team_name,
      status, checked_in_at, event_reservation_id
    ) VALUES (
      '62a29493-7c8a-474a-a509-7224a8fb0cd7', 'record-de-la-hora',
      COALESCE(v_alumno.nombre, ''), COALESCE(v_alumno.apellido, ''), lower(v_alumno.email), '',
      'registered', NULL, r.res_id
    ) RETURNING id INTO v_ep_id;

    UPDATE public.event_reservations
       SET event_participant_id = v_ep_id,
           origin = COALESCE(origin, 'mayo_existing_reservation'),
           updated_at = now()
     WHERE id = r.res_id;
  END LOOP;
END $$;
