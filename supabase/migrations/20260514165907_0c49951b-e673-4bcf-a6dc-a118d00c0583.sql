
-- Audit improvements for WhatsApp check
ALTER TABLE public.whatsapp_check_items
  ADD COLUMN IF NOT EXISTS grupo_incorrecto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grupo_real_sugerido text;

ALTER TABLE public.whatsapp_check_runs
  ADD COLUMN IF NOT EXISTS notas_cierre text,
  ADD COLUMN IF NOT EXISTS cerrado_por uuid,
  ADD COLUMN IF NOT EXISTS desconocidos_en_grupo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grupo_mal_asignado integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan_vencido_en_grupo integer NOT NULL DEFAULT 0;

-- Tabla de "extras" detectados en el grupo de WhatsApp pero que NO figuran como alumnos del grupo en la app
CREATE TABLE IF NOT EXISTS public.whatsapp_check_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.whatsapp_check_runs(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  telefono text,
  alumno_id uuid,           -- si se logró matchear con un alumno existente
  motivo text,              -- 'no_es_alumno' | 'alumno_otro_grupo' | 'alumno_inactivo' | 'desconocido'
  nota text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_extras_run ON public.whatsapp_check_extras(run_id);

ALTER TABLE public.whatsapp_check_extras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage wa_check_extras" ON public.whatsapp_check_extras;
CREATE POLICY "Admins manage wa_check_extras" ON public.whatsapp_check_extras
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- Permitir lectura del historial completo a super admins (políticas adicionales)
DROP POLICY IF EXISTS "Super admin reads wa_runs" ON public.whatsapp_check_runs;
CREATE POLICY "Super admin reads wa_runs" ON public.whatsapp_check_runs
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin reads wa_items" ON public.whatsapp_check_items;
CREATE POLICY "Super admin reads wa_items" ON public.whatsapp_check_items
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
