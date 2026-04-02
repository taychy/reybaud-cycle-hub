
-- Create student activity log table
CREATE TABLE public.student_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alumno_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  actor_id UUID,
  actor_email TEXT,
  actor_role TEXT NOT NULL DEFAULT 'sistema',
  reference_type TEXT,
  reference_id TEXT,
  reference_label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups by alumno
CREATE INDEX idx_student_activity_alumno ON public.student_activity_log (alumno_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.student_activity_log ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage student_activity_log"
  ON public.student_activity_log
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
