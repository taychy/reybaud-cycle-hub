
CREATE TABLE public.alumno_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  created_by UUID,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alumno_notas_alumno ON public.alumno_notas(alumno_id, created_at DESC);

ALTER TABLE public.alumno_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage alumno_notas"
ON public.alumno_notas
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_alumno_notas_updated
BEFORE UPDATE ON public.alumno_notas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.alumno_notas (alumno_id, contenido, created_at)
SELECT id, notas, COALESCE(updated_at, created_at, now())
FROM public.alumnos
WHERE notas IS NOT NULL AND length(trim(notas)) > 0;
