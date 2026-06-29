
CREATE TABLE public.disponibilidad_ajustada (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('bloquear','reemplazar','agregar')),
  hora_inicio time NULL,
  hora_fin time NULL,
  motivo text NULL,
  creado_por uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_disp_ajust_fecha ON public.disponibilidad_ajustada(fecha);
CREATE INDEX idx_disp_ajust_coach ON public.disponibilidad_ajustada(coach_id);

CREATE OR REPLACE FUNCTION public.disp_ajust_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo IN ('reemplazar','agregar') THEN
    IF NEW.hora_inicio IS NULL OR NEW.hora_fin IS NULL THEN
      RAISE EXCEPTION 'hora_inicio y hora_fin requeridos para tipo %', NEW.tipo;
    END IF;
    IF NEW.hora_fin <= NEW.hora_inicio THEN
      RAISE EXCEPTION 'hora_fin debe ser mayor que hora_inicio';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_disp_ajust_validate
BEFORE INSERT OR UPDATE ON public.disponibilidad_ajustada
FOR EACH ROW EXECUTE FUNCTION public.disp_ajust_validate();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.disponibilidad_ajustada TO authenticated;
GRANT ALL ON public.disponibilidad_ajustada TO service_role;

ALTER TABLE public.disponibilidad_ajustada ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage disp ajustada"
ON public.disponibilidad_ajustada
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "coaches read own/global disp ajustada"
ON public.disponibilidad_ajustada
FOR SELECT
TO authenticated
USING (
  coach_id IS NULL
  OR EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = disponibilidad_ajustada.coach_id AND c.user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.get_disponibilidad_ajustada_publica(
  p_desde date,
  p_hasta date
)
RETURNS TABLE (
  id uuid,
  coach_id uuid,
  fecha date,
  tipo text,
  hora_inicio time,
  hora_fin time
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, coach_id, fecha, tipo, hora_inicio, hora_fin
  FROM public.disponibilidad_ajustada
  WHERE fecha BETWEEN p_desde AND p_hasta
$$;

GRANT EXECUTE ON FUNCTION public.get_disponibilidad_ajustada_publica(date, date) TO anon, authenticated;
