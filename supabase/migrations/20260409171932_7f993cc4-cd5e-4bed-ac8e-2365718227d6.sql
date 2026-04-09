
-- Table to track all notifications sent to students about their reservations
CREATE TABLE public.reservation_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'novedad',
  canal TEXT NOT NULL DEFAULT 'email',
  asunto TEXT NOT NULL,
  contenido TEXT NOT NULL,
  enviado_por UUID,
  enviado_por_email TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reservation_notifications ENABLE ROW LEVEL SECURITY;

-- Admins can manage all notifications
CREATE POLICY "Admins can manage reservation_notifications"
ON public.reservation_notifications
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Students can view their own notifications
CREATE POLICY "Students can view own reservation_notifications"
ON public.reservation_notifications
FOR SELECT
TO authenticated
USING (alumno_id IN (
  SELECT a.id FROM alumnos a WHERE a.user_id = auth.uid()
));

-- Index for fast lookups
CREATE INDEX idx_reservation_notifications_reservation ON public.reservation_notifications(reservation_id);
CREATE INDEX idx_reservation_notifications_alumno ON public.reservation_notifications(alumno_id);
CREATE INDEX idx_reservation_notifications_idempotency ON public.reservation_notifications(idempotency_key);
