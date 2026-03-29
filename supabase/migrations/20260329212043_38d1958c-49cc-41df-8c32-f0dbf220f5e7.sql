
-- Create event_favorites table
CREATE TABLE public.event_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(alumno_id, event_id)
);

-- Enable RLS
ALTER TABLE public.event_favorites ENABLE ROW LEVEL SECURITY;

-- Students can view their own favorites
CREATE POLICY "Students can view own favorites"
ON public.event_favorites
FOR SELECT
TO authenticated
USING (alumno_id IN (
  SELECT id FROM public.alumnos WHERE user_id = auth.uid()
));

-- Students can insert own favorites
CREATE POLICY "Students can insert own favorites"
ON public.event_favorites
FOR INSERT
TO authenticated
WITH CHECK (alumno_id IN (
  SELECT id FROM public.alumnos WHERE user_id = auth.uid()
));

-- Students can delete own favorites
CREATE POLICY "Students can delete own favorites"
ON public.event_favorites
FOR DELETE
TO authenticated
USING (alumno_id IN (
  SELECT id FROM public.alumnos WHERE user_id = auth.uid()
));

-- Admins can manage all favorites
CREATE POLICY "Admins can manage event_favorites"
ON public.event_favorites
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
