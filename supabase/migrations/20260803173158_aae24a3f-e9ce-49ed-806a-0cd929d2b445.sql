CREATE OR REPLACE FUNCTION public.guard_single_open_process_instance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_existing uuid;
BEGIN
  IF NEW.estado <> 'en_curso' THEN RETURN NEW; END IF;
  SELECT id INTO v_existing
  FROM public.process_instances
  WHERE template_id = NEW.template_id
    AND iniciado_por = NEW.iniciado_por
    AND estado = 'en_curso'
    AND id <> NEW.id
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Ya tenés un proceso en curso de esta plantilla (%). Continualo o cancelalo antes de iniciar otro.', v_existing
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_single_open_process_instance ON public.process_instances;
CREATE TRIGGER trg_guard_single_open_process_instance
BEFORE INSERT ON public.process_instances
FOR EACH ROW EXECUTE FUNCTION public.guard_single_open_process_instance();