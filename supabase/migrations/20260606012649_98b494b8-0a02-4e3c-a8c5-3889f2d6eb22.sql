
-- 1. Planes: tipo_consumo y campos del bono
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS tipo_consumo text NOT NULL DEFAULT 'mensual',
  ADD COLUMN IF NOT EXISTS clases_incluidas integer,
  ADD COLUMN IF NOT EXISTS vigencia_dias integer;

ALTER TABLE public.planes
  ADD CONSTRAINT planes_tipo_consumo_check CHECK (tipo_consumo IN ('mensual','bono'));

-- 2. Suscripciones: snapshot del bono
ALTER TABLE public.suscripciones
  ADD COLUMN IF NOT EXISTS clases_totales integer,
  ADD COLUMN IF NOT EXISTS clases_consumidas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clases_vencimiento date;

-- 3. Log auditable de clases consumidas
CREATE TABLE IF NOT EXISTS public.clases_consumidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscripcion_id uuid NOT NULL REFERENCES public.suscripciones(id) ON DELETE CASCADE,
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL,
  reserva_id uuid,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  notas text,
  creada_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clases_consumidas TO authenticated;
GRANT ALL ON public.clases_consumidas TO service_role;

ALTER TABLE public.clases_consumidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/coach/super gestionan clases consumidas"
  ON public.clases_consumidas FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'coach'::app_role)
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'coach'::app_role)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Alumno lee sus clases consumidas"
  ON public.clases_consumidas FOR SELECT
  TO authenticated
  USING (
    alumno_id IN (SELECT id FROM public.alumnos WHERE email = auth.email())
  );

CREATE INDEX IF NOT EXISTS idx_clases_consumidas_sub ON public.clases_consumidas(suscripcion_id);
CREATE INDEX IF NOT EXISTS idx_clases_consumidas_alumno ON public.clases_consumidas(alumno_id, fecha DESC);

CREATE TRIGGER clases_consumidas_updated_at
  BEFORE UPDATE ON public.clases_consumidas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RPC: consumir clase
CREATE OR REPLACE FUNCTION public.consumir_clase_bono(
  p_suscripcion_id uuid,
  p_fecha date DEFAULT CURRENT_DATE,
  p_notas text DEFAULT NULL,
  p_coach_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_clase_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
       OR public.has_role(auth.uid(),'coach'::app_role)
       OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_sub FROM public.suscripciones WHERE id = p_suscripcion_id FOR UPDATE;
  IF v_sub IS NULL THEN RAISE EXCEPTION 'Suscripción no encontrada'; END IF;
  IF v_sub.clases_totales IS NULL THEN
    RAISE EXCEPTION 'Esta suscripción no es un bono de clases';
  END IF;
  IF v_sub.clases_consumidas >= v_sub.clases_totales THEN
    RAISE EXCEPTION 'BONO_AGOTADO: el alumno ya consumió las % clases', v_sub.clases_totales;
  END IF;
  IF v_sub.clases_vencimiento IS NOT NULL AND v_sub.clases_vencimiento < CURRENT_DATE THEN
    RAISE EXCEPTION 'BONO_VENCIDO: el bono venció el %', v_sub.clases_vencimiento;
  END IF;

  INSERT INTO public.clases_consumidas(suscripcion_id, alumno_id, coach_id, fecha, notas, creada_por)
  VALUES (p_suscripcion_id, v_sub.alumno_id, p_coach_id, COALESCE(p_fecha, CURRENT_DATE), p_notas, auth.uid())
  RETURNING id INTO v_clase_id;

  UPDATE public.suscripciones
  SET clases_consumidas = clases_consumidas + 1,
      estado = CASE WHEN clases_consumidas + 1 >= clases_totales THEN 'vencida' ELSE estado END,
      updated_at = now()
  WHERE id = p_suscripcion_id;

  RETURN v_clase_id;
END;
$$;

-- 5. RPC: revertir clase
CREATE OR REPLACE FUNCTION public.revertir_clase_bono(p_clase_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clase record;
  v_sub record;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
       OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_clase FROM public.clases_consumidas WHERE id = p_clase_id;
  IF v_clase IS NULL THEN RETURN; END IF;

  SELECT * INTO v_sub FROM public.suscripciones WHERE id = v_clase.suscripcion_id FOR UPDATE;

  DELETE FROM public.clases_consumidas WHERE id = p_clase_id;

  UPDATE public.suscripciones
  SET clases_consumidas = GREATEST(clases_consumidas - 1, 0),
      estado = CASE WHEN estado = 'vencida' AND clases_consumidas - 1 < clases_totales
                      AND (clases_vencimiento IS NULL OR clases_vencimiento >= CURRENT_DATE)
                    THEN 'activa' ELSE estado END,
      updated_at = now()
  WHERE id = v_clase.suscripcion_id;
END;
$$;

-- 6. Trigger: al crear o activar una sub de plan tipo bono, snapshot de clases y vencimiento
CREATE OR REPLACE FUNCTION public.snapshot_bono_on_sub()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_plan record;
BEGIN
  SELECT tipo_consumo, clases_incluidas, vigencia_dias
    INTO v_plan FROM public.planes WHERE id = NEW.plan_id;

  IF v_plan.tipo_consumo = 'bono' THEN
    IF NEW.clases_totales IS NULL THEN
      NEW.clases_totales := v_plan.clases_incluidas;
    END IF;
    IF NEW.clases_vencimiento IS NULL AND v_plan.vigencia_dias IS NOT NULL THEN
      NEW.clases_vencimiento := COALESCE(NEW.fecha_inicio, CURRENT_DATE) + (v_plan.vigencia_dias || ' days')::interval;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_bono_on_sub ON public.suscripciones;
CREATE TRIGGER trg_snapshot_bono_on_sub
  BEFORE INSERT ON public.suscripciones
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_bono_on_sub();
