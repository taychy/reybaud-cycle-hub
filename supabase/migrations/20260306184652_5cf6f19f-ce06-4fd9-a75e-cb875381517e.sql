
CREATE TABLE public.event_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  distance_km numeric NULL,
  notes text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(event_id, alumno_id)
);

ALTER TABLE public.event_results ENABLE ROW LEVEL SECURITY;

-- Anyone can read results (public ranking)
CREATE POLICY "Anyone can read event_results"
  ON public.event_results FOR SELECT
  USING (true);

-- Anyone can insert their own result (no auth required, alumno-based)
CREATE POLICY "Anyone can insert event_results"
  ON public.event_results FOR INSERT
  WITH CHECK (true);

-- Anyone can update their own result
CREATE POLICY "Anyone can update event_results"
  ON public.event_results FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Admins can manage all
CREATE POLICY "Admins can manage event_results"
  ON public.event_results FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
