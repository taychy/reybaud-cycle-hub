
-- Tablas para chequeo mensual de grupos de WhatsApp
CREATE TABLE public.whatsapp_check_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo TEXT NOT NULL,
  fecha_objetivo DATE NOT NULL,
  admin_id UUID,
  total_esperados INTEGER NOT NULL DEFAULT 0,
  confirmados INTEGER NOT NULL DEFAULT 0,
  faltantes INTEGER NOT NULL DEFAULT 0,
  plan_revision INTEGER NOT NULL DEFAULT 0,
  saltados INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  cerrado_at TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_runs_grupo_fecha ON public.whatsapp_check_runs(grupo, fecha_objetivo DESC);
CREATE INDEX idx_wa_runs_estado ON public.whatsapp_check_runs(estado);

CREATE TABLE public.whatsapp_check_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.whatsapp_check_runs(id) ON DELETE CASCADE,
  alumno_id UUID NOT NULL,
  nombre_snapshot TEXT NOT NULL,
  resultado TEXT NOT NULL DEFAULT 'pendiente',
  plan_inconsistente BOOLEAN NOT NULL DEFAULT false,
  nota TEXT,
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_items_run ON public.whatsapp_check_items(run_id);
CREATE INDEX idx_wa_items_alumno ON public.whatsapp_check_items(alumno_id);

ALTER TABLE public.whatsapp_check_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_check_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage wa_check_runs"
ON public.whatsapp_check_runs FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage wa_check_items"
ON public.whatsapp_check_items FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_wa_runs_updated
BEFORE UPDATE ON public.whatsapp_check_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
