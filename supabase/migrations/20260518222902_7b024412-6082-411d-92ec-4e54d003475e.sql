
-- 1. Agregar columnas a alumnos
ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS contacto_emergencia_relacion text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre_2 text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono_2 text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_relacion_2 text,
  ADD COLUMN IF NOT EXISTS obra_social_nombre text,
  ADD COLUMN IF NOT EXISTS obra_social_numero_socio text,
  ADD COLUMN IF NOT EXISTS obra_social_plan text;

-- 2. Tabla alumno_familiares
CREATE TABLE IF NOT EXISTS public.alumno_familiares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  familiar_alumno_id uuid REFERENCES public.alumnos(id) ON DELETE CASCADE,
  familiar_externo_nombre text,
  familiar_externo_telefono text,
  relacion text NOT NULL DEFAULT 'otro',
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT chk_familiar_target CHECK (
    familiar_alumno_id IS NOT NULL OR (familiar_externo_nombre IS NOT NULL AND length(trim(familiar_externo_nombre)) > 0)
  ),
  CONSTRAINT chk_familiar_no_self CHECK (familiar_alumno_id IS NULL OR familiar_alumno_id <> alumno_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_alumno_familiares_pair
  ON public.alumno_familiares(alumno_id, familiar_alumno_id)
  WHERE familiar_alumno_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alumno_familiares_alumno ON public.alumno_familiares(alumno_id);
CREATE INDEX IF NOT EXISTS idx_alumno_familiares_familiar ON public.alumno_familiares(familiar_alumno_id);

ALTER TABLE public.alumno_familiares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage alumno_familiares"
ON public.alumno_familiares
AS PERMISSIVE
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Alumno views own familiares"
ON public.alumno_familiares
AS PERMISSIVE
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.alumnos a
    WHERE a.id = alumno_familiares.alumno_id
      AND (a.user_id = auth.uid() OR a.email = auth.email())
  )
);

-- 3. Trigger reciprocidad
CREATE OR REPLACE FUNCTION public.alumno_familiares_reciprocal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reverse_rel text;
BEGIN
  IF NEW.familiar_alumno_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mapear relación inversa
  v_reverse_rel := CASE NEW.relacion
    WHEN 'padre' THEN 'hijo'
    WHEN 'madre' THEN 'hijo'
    WHEN 'hijo' THEN 'padre_madre'
    WHEN 'hermano' THEN 'hermano'
    WHEN 'conyuge' THEN 'conyuge'
    ELSE 'otro'
  END;

  -- Insertar el inverso si no existe
  IF NOT EXISTS (
    SELECT 1 FROM public.alumno_familiares
    WHERE alumno_id = NEW.familiar_alumno_id
      AND familiar_alumno_id = NEW.alumno_id
  ) THEN
    INSERT INTO public.alumno_familiares (
      alumno_id, familiar_alumno_id, relacion, notas, created_by
    ) VALUES (
      NEW.familiar_alumno_id, NEW.alumno_id, v_reverse_rel, NEW.notas, NEW.created_by
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_alumno_familiares_reciprocal
AFTER INSERT ON public.alumno_familiares
FOR EACH ROW
EXECUTE FUNCTION public.alumno_familiares_reciprocal();

-- Borrado recíproco
CREATE OR REPLACE FUNCTION public.alumno_familiares_delete_reciprocal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.familiar_alumno_id IS NOT NULL THEN
    DELETE FROM public.alumno_familiares
    WHERE alumno_id = OLD.familiar_alumno_id
      AND familiar_alumno_id = OLD.alumno_id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_alumno_familiares_delete_reciprocal
AFTER DELETE ON public.alumno_familiares
FOR EACH ROW
EXECUTE FUNCTION public.alumno_familiares_delete_reciprocal();
