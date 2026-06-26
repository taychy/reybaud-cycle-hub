
-- 1) FKs CASCADE → SET NULL para preservar historial
ALTER TABLE public.gastos_ejecuciones
  DROP CONSTRAINT IF EXISTS gastos_ejecuciones_recurrente_id_fkey;
ALTER TABLE public.gastos_ejecuciones
  ADD CONSTRAINT gastos_ejecuciones_recurrente_id_fkey
  FOREIGN KEY (recurrente_id) REFERENCES public.gastos_recurrentes(id) ON DELETE SET NULL;

ALTER TABLE public.gastos_deuda_movimientos
  DROP CONSTRAINT IF EXISTS gastos_deuda_movimientos_recurrente_id_fkey;
ALTER TABLE public.gastos_deuda_movimientos
  ADD CONSTRAINT gastos_deuda_movimientos_recurrente_id_fkey
  FOREIGN KEY (recurrente_id) REFERENCES public.gastos_recurrentes(id) ON DELETE SET NULL;

-- 2) Soft delete en gastos_recurrentes
ALTER TABLE public.gastos_recurrentes
  ADD COLUMN IF NOT EXISTS archivado_at timestamptz,
  ADD COLUMN IF NOT EXISTS archivado_por uuid;

-- 3) audit_log: user_id nullable (para acciones de sistema/triggers sin sesión)
ALTER TABLE public.audit_log ALTER COLUMN user_id DROP NOT NULL;

-- Política de insert: permitir inserts desde triggers (SECURITY DEFINER) cuando no hay auth
DROP POLICY IF EXISTS "Admins can insert audit_log" ON public.audit_log;
CREATE POLICY "Admins or system can insert audit_log"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role))
    OR user_id IS NULL
  );

-- 4) Función de auditoría genérica para tablas de gastos
CREATE OR REPLACE FUNCTION public.audit_gastos_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text := 'system';
  v_entity_id text;
  v_action text;
  v_details jsonb;
BEGIN
  -- Resolver email y rol del usuario actual (si hay)
  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
    SELECT COALESCE(role::text, 'admin') INTO v_role
      FROM public.admin_profiles WHERE user_id = v_user_id LIMIT 1;
    IF v_role IS NULL THEN v_role := 'admin'; END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'crear_' || TG_TABLE_NAME;
    v_entity_id := (row_to_json(NEW)->>'id');
    v_details := jsonb_build_object('after', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'editar_' || TG_TABLE_NAME;
    v_entity_id := (row_to_json(NEW)->>'id');
    -- Detectar si es un archivado (caso especial)
    IF TG_TABLE_NAME = 'gastos_recurrentes'
       AND OLD.archivado_at IS NULL AND NEW.archivado_at IS NOT NULL THEN
      v_action := 'archivar_gastos_recurrentes';
    ELSIF TG_TABLE_NAME = 'gastos_recurrentes'
       AND OLD.archivado_at IS NOT NULL AND NEW.archivado_at IS NULL THEN
      v_action := 'desarchivar_gastos_recurrentes';
    END IF;
    v_details := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'eliminar_' || TG_TABLE_NAME;
    v_entity_id := (row_to_json(OLD)->>'id');
    v_details := jsonb_build_object('before', to_jsonb(OLD));
  END IF;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (v_user_id, v_email, v_role, v_action, TG_TABLE_NAME, v_entity_id, v_details);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- 5) Triggers en las 4 tablas
DROP TRIGGER IF EXISTS trg_audit_gastos_recurrentes ON public.gastos_recurrentes;
CREATE TRIGGER trg_audit_gastos_recurrentes
  AFTER INSERT OR UPDATE OR DELETE ON public.gastos_recurrentes
  FOR EACH ROW EXECUTE FUNCTION public.audit_gastos_change();

DROP TRIGGER IF EXISTS trg_audit_gastos ON public.gastos;
CREATE TRIGGER trg_audit_gastos
  AFTER INSERT OR UPDATE OR DELETE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.audit_gastos_change();

DROP TRIGGER IF EXISTS trg_audit_gastos_ejecuciones ON public.gastos_ejecuciones;
CREATE TRIGGER trg_audit_gastos_ejecuciones
  AFTER INSERT OR UPDATE OR DELETE ON public.gastos_ejecuciones
  FOR EACH ROW EXECUTE FUNCTION public.audit_gastos_change();

DROP TRIGGER IF EXISTS trg_audit_gastos_deuda_mov ON public.gastos_deuda_movimientos;
CREATE TRIGGER trg_audit_gastos_deuda_mov
  AFTER INSERT OR UPDATE OR DELETE ON public.gastos_deuda_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.audit_gastos_change();
