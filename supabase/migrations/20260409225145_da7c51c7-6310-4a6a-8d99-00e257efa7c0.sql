
-- Create table for trip preparation checklist data
CREATE TABLE public.reservation_checklist_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  needs_advice BOOLEAN NOT NULL DEFAULT false,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(reservation_id, step_key)
);

-- Enable RLS
ALTER TABLE public.reservation_checklist_data ENABLE ROW LEVEL SECURITY;

-- Students can view their own checklist data
CREATE POLICY "Students can view own checklist data"
ON public.reservation_checklist_data
FOR SELECT
TO authenticated
USING (alumno_id IN (SELECT a.id FROM alumnos a WHERE a.user_id = auth.uid()));

-- Students can insert their own checklist data
CREATE POLICY "Students can insert own checklist data"
ON public.reservation_checklist_data
FOR INSERT
TO authenticated
WITH CHECK (alumno_id IN (SELECT a.id FROM alumnos a WHERE a.user_id = auth.uid()));

-- Students can update their own checklist data
CREATE POLICY "Students can update own checklist data"
ON public.reservation_checklist_data
FOR UPDATE
TO authenticated
USING (alumno_id IN (SELECT a.id FROM alumnos a WHERE a.user_id = auth.uid()));

-- Admins can manage all
CREATE POLICY "Admins can manage checklist data"
ON public.reservation_checklist_data
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_reservation_checklist_data_updated_at
BEFORE UPDATE ON public.reservation_checklist_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for trip documents
INSERT INTO storage.buckets (id, name, public) VALUES ('trip-documents', 'trip-documents', true);

-- Storage policies
CREATE POLICY "Anyone can view trip documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'trip-documents');

CREATE POLICY "Authenticated users can upload trip documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'trip-documents');

CREATE POLICY "Authenticated users can update own trip documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'trip-documents');
