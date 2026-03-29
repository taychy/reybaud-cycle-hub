
-- Table for event reservations (camps, viajes, etc.)
CREATE TABLE public.event_reservations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'pendiente_verificacion',
  metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
  monto NUMERIC,
  moneda TEXT NOT NULL DEFAULT 'ARS',
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, alumno_id)
);

-- Enable RLS
ALTER TABLE public.event_reservations ENABLE ROW LEVEL SECURITY;

-- Admins can manage all reservations
CREATE POLICY "Admins can manage event_reservations"
  ON public.event_reservations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Students can view own reservations
CREATE POLICY "Students can view own event_reservations"
  ON public.event_reservations FOR SELECT
  TO authenticated
  USING (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));

-- Students can insert own reservations
CREATE POLICY "Students can insert own event_reservations"
  ON public.event_reservations FOR INSERT
  TO authenticated
  WITH CHECK (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));
