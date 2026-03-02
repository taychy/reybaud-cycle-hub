
-- Create event type enum
CREATE TYPE public.event_type AS ENUM ('record_hora', 'camp', 'carrera', 'otro');

-- Create events table
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  date date NOT NULL,
  start_time time,
  end_time time,
  type event_type NOT NULL DEFAULT 'otro',
  is_active boolean NOT NULL DEFAULT true,
  visible_to_students boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Anyone can view active events
CREATE POLICY "Anyone can view active events"
ON public.events FOR SELECT
USING (is_active = true);

-- Admins can manage events
CREATE POLICY "Admins can manage events"
ON public.events FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed Record de la Hora event
INSERT INTO public.events (title, description, date, start_time, type, is_active, visible_to_students)
VALUES ('Record de la hora', 'Evento de registro horario / record de la hora', '2026-03-03', '08:00', 'record_hora', true, true);
