CREATE TABLE public.solicitudes_cambio_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL,
  sub_actual_id UUID,
  sub_nueva_id UUID,
  plan_actual_id UUID,
  plan_nuevo_id UUID,
  plan_actual_nombre TEXT,
  plan_nuevo_nombre TEXT,
  diferencia NUMERIC,
  scope TEXT NOT NULL DEFAULT 'actual',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelto_at TIMESTAMPTZ,
  resuelto_por UUID,
  CONSTRAINT scope_chk CHECK (scope IN ('actual','siguiente')),
  CONSTRAINT estado_chk CHECK (estado IN ('pendiente','resuelto','rechazado'))
);

GRANT SELECT, INSERT, UPDATE ON public.solicitudes_cambio_plan TO authenticated;
GRANT ALL ON public.solicitudes_cambio_plan TO service_role;

ALTER TABLE public.solicitudes_cambio_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gestionan solicitudes" ON public.solicitudes_cambio_plan
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Alumno crea su solicitud" ON public.solicitudes_cambio_plan
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.alumnos a
      WHERE a.id = solicitudes_cambio_plan.alumno_id
        AND lower(a.email) = lower(auth.email())
    )
  );

CREATE POLICY "Alumno ve sus solicitudes" ON public.solicitudes_cambio_plan
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alumnos a
      WHERE a.id = solicitudes_cambio_plan.alumno_id
        AND lower(a.email) = lower(auth.email())
    )
  );

CREATE INDEX idx_solicitudes_cp_estado ON public.solicitudes_cambio_plan(estado);
CREATE INDEX idx_solicitudes_cp_alumno ON public.solicitudes_cambio_plan(alumno_id);