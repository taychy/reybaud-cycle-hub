
-- Create external participants table
CREATE TABLE public.event_external_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT,
  email TEXT NOT NULL,
  telefono TEXT,
  documento TEXT,
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'activo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_external_participants ENABLE ROW LEVEL SECURITY;

-- Admin access
CREATE POLICY "Admins can manage event_external_participants"
ON public.event_external_participants
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_event_external_participants_updated_at
BEFORE UPDATE ON public.event_external_participants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Make alumno_id nullable on event_reservations
ALTER TABLE public.event_reservations
ALTER COLUMN alumno_id DROP NOT NULL;

-- Add external_participant_id column
ALTER TABLE public.event_reservations
ADD COLUMN external_participant_id UUID REFERENCES public.event_external_participants(id);

-- Add check constraint: at least one of alumno_id or external_participant_id must be set
ALTER TABLE public.event_reservations
ADD CONSTRAINT chk_reservation_participant
CHECK (alumno_id IS NOT NULL OR external_participant_id IS NOT NULL);

-- Update notify function reference: allow external participants to be looked up
-- Add RLS policy for external participant reservations (admin only for now)
CREATE POLICY "Admins can manage external participant reservations"
ON public.event_reservations
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND external_participant_id IS NOT NULL)
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND external_participant_id IS NOT NULL);
