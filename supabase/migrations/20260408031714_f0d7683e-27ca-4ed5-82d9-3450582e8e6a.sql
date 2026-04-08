-- Add saldo_a_favor to alumnos for plan change credits
ALTER TABLE public.alumnos ADD COLUMN saldo_a_favor numeric NOT NULL DEFAULT 0;

-- Create plan change log table
CREATE TABLE public.cambios_plan (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  suscripcion_anterior_id uuid NOT NULL REFERENCES public.suscripciones(id),
  suscripcion_nueva_id uuid NOT NULL REFERENCES public.suscripciones(id),
  plan_anterior_id uuid NOT NULL REFERENCES public.planes(id),
  plan_nuevo_id uuid NOT NULL REFERENCES public.planes(id),
  precio_anterior numeric NOT NULL,
  precio_nuevo numeric NOT NULL,
  dias_restantes integer NOT NULL,
  dias_totales integer NOT NULL,
  credito_calculado numeric NOT NULL DEFAULT 0,
  costo_nuevo_prorrateado numeric NOT NULL DEFAULT 0,
  diferencia numeric NOT NULL DEFAULT 0,
  saldo_aplicado numeric NOT NULL DEFAULT 0,
  realizado_por uuid,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cambios_plan ENABLE ROW LEVEL SECURITY;

-- Admins can manage
CREATE POLICY "Admins can manage cambios_plan" ON public.cambios_plan
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Students can view own
CREATE POLICY "Students can view own cambios_plan" ON public.cambios_plan
  FOR SELECT TO authenticated
  USING (alumno_id IN (SELECT id FROM alumnos WHERE user_id = auth.uid()));

-- Students can insert own (for self-service plan change)
CREATE POLICY "Students can insert own cambios_plan" ON public.cambios_plan
  FOR INSERT TO authenticated
  WITH CHECK (alumno_id IN (SELECT id FROM alumnos WHERE user_id = auth.uid()));