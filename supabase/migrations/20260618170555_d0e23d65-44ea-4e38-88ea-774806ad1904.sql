
-- 1) Events: incluye / no incluye
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS incluye text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS no_incluye text[] NOT NULL DEFAULT '{}';

-- 2) Event packages: capacity by gender + room size
ALTER TABLE public.event_packages
  ADD COLUMN IF NOT EXISTS personas_por_habitacion integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS cupo_mujeres integer,
  ADD COLUMN IF NOT EXISTS cupo_varones integer,
  ADD COLUMN IF NOT EXISTS cupo_mixto integer,
  ADD COLUMN IF NOT EXISTS permite_mixto boolean NOT NULL DEFAULT false;

-- 3) Reservation: room gender + couple/friends + auto-assign preference
ALTER TABLE public.event_reservations
  ADD COLUMN IF NOT EXISTS genero_habitacion text,
  ADD COLUMN IF NOT EXISTS tipo_vinculo text,
  ADD COLUMN IF NOT EXISTS prefiere_asignacion boolean NOT NULL DEFAULT false;

ALTER TABLE public.event_reservations
  DROP CONSTRAINT IF EXISTS event_reservations_genero_habitacion_check;
ALTER TABLE public.event_reservations
  ADD CONSTRAINT event_reservations_genero_habitacion_check
  CHECK (genero_habitacion IS NULL OR genero_habitacion IN ('femenina','masculina','mixta'));

ALTER TABLE public.event_reservations
  DROP CONSTRAINT IF EXISTS event_reservations_tipo_vinculo_check;
ALTER TABLE public.event_reservations
  ADD CONSTRAINT event_reservations_tipo_vinculo_check
  CHECK (tipo_vinculo IS NULL OR tipo_vinculo IN ('pareja','amigos'));

-- 4) Roommates declared per reservation
CREATE TABLE IF NOT EXISTS public.reservation_roommates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  posicion integer NOT NULL,
  nombre text NOT NULL,
  email text,
  telefono text,
  alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  confirmado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, posicion)
);

CREATE INDEX IF NOT EXISTS idx_roommates_reservation ON public.reservation_roommates(reservation_id);
CREATE INDEX IF NOT EXISTS idx_roommates_alumno ON public.reservation_roommates(alumno_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_roommates TO authenticated;
GRANT ALL ON public.reservation_roommates TO service_role;

ALTER TABLE public.reservation_roommates ENABLE ROW LEVEL SECURITY;

-- Owner of the reservation can manage their roommate list
CREATE POLICY "Alumno manages own roommates"
  ON public.reservation_roommates FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_reservations r
      JOIN public.alumnos a ON a.id = r.alumno_id
      WHERE r.id = reservation_id AND a.email = auth.email()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_reservations r
      JOIN public.alumnos a ON a.id = r.alumno_id
      WHERE r.id = reservation_id AND a.email = auth.email()
    )
  );

-- Admins manage all
CREATE POLICY "Admins manage roommates"
  ON public.reservation_roommates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_roommates_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_roommates_updated_at ON public.reservation_roommates;
CREATE TRIGGER trg_roommates_updated_at
  BEFORE UPDATE ON public.reservation_roommates
  FOR EACH ROW EXECUTE FUNCTION public.set_roommates_updated_at();
