ALTER TABLE public.facturacion_cola ADD COLUMN excluida_facturacion boolean NOT NULL DEFAULT false, ADD COLUMN exclusion_por uuid, ADD COLUMN exclusion_at timestamptz, ADD COLUMN reinclusion_por uuid, ADD COLUMN reinclusion_at timestamptz;
CREATE TABLE public.facturacion_cola_exclusion_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cola_id uuid NOT NULL REFERENCES public.facturacion_cola(id), accion text NOT NULL CHECK (accion IN ('excluir','reincluir')), usuario_id uuid NOT NULL, fecha timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.facturacion_cola_exclusion_log TO authenticated;
GRANT ALL ON public.facturacion_cola_exclusion_log TO service_role;
ALTER TABLE public.facturacion_cola_exclusion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_exclusion_admin_read ON public.facturacion_cola_exclusion_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE INDEX facturacion_cola_exclusion_log_cola_fecha ON public.facturacion_cola_exclusion_log(cola_id, fecha DESC);
CREATE OR REPLACE FUNCTION public.tg_facturacion_exclusion_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_old_excluded boolean := false; v_new_excluded boolean; v_action text;
BEGIN
 IF TG_OP = 'DELETE' THEN
  IF OLD.excluida_facturacion OR OLD.estado = 'excluida' THEN RAISE EXCEPTION 'No se puede borrar una exclusión persistente de facturación'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP = 'UPDATE' THEN
  v_old_excluded := OLD.excluida_facturacion OR OLD.estado = 'excluida';
  IF v_old_excluded AND (NEW.referencia_tipo, NEW.referencia_id, NEW.pago_id, NEW.source) IS DISTINCT FROM (OLD.referencia_tipo, OLD.referencia_id, OLD.pago_id, OLD.source) THEN RAISE EXCEPTION 'No se puede cambiar la identidad de un cobro excluido'; END IF;
  IF OLD.excluida_facturacion AND NEW.excluida_facturacion THEN NEW.estado := 'excluida'; END IF;
 END IF;
 v_new_excluded := NEW.excluida_facturacion OR NEW.estado = 'excluida';
 IF TG_OP = 'INSERT' AND v_new_excluded THEN RAISE EXCEPTION 'Primero registrar el cobro, luego excluirlo'; END IF;
 IF TG_OP = 'UPDATE' AND OLD.excluida_facturacion AND NOT NEW.excluida_facturacion THEN v_new_excluded := false; NEW.estado := 'pendiente'; END IF;
 IF v_new_excluded IS DISTINCT FROM v_old_excluded THEN
  IF auth.uid() IS NULL OR NOT coalesce(public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()), false) THEN RAISE EXCEPTION 'Solo administración puede excluir o volver a incluir cobros'; END IF;
  IF TG_OP = 'UPDATE' AND (OLD.estado IN ('facturada','anulada') OR OLD.auto_estado IN ('emitiendo','facturada')) THEN RAISE EXCEPTION 'No se puede cambiar la exclusión de un comprobante emitido, anulado o en emisión'; END IF;
  IF EXISTS (SELECT 1 FROM public.facturas f WHERE (f.facturacion_cola_id = NEW.id OR f.id = NEW.factura_id OR (f.facturacion_cola_id IS NULL AND f.referencia_tipo = NEW.referencia_tipo AND f.referencia_id = NEW.referencia_id)) AND (f.estado IN ('emitida','emitiendo') OR f.cae IS NOT NULL OR f.recuperacion_estado = 'incierta')) THEN RAISE EXCEPTION 'El cobro tiene un comprobante emitido o una emisión en curso/incierta'; END IF;
  v_action := CASE WHEN v_new_excluded THEN 'excluir' ELSE 'reincluir' END;
  IF v_new_excluded THEN NEW.exclusion_por := auth.uid(); NEW.exclusion_at := clock_timestamp();
  ELSE NEW.reinclusion_por := auth.uid(); NEW.reinclusion_at := clock_timestamp(); NEW.auto_estado := 'manual'; NEW.auto_reevaluar_at := clock_timestamp(); NEW.auto_intentos := 0; NEW.auto_proximo_intento_at := NULL; END IF;
  INSERT INTO public.facturacion_cola_exclusion_log(cola_id, accion, usuario_id) VALUES (NEW.id, v_action, auth.uid());
 END IF;
 NEW.excluida_facturacion := v_new_excluded;
 IF v_new_excluded THEN NEW.estado := 'excluida'; NEW.auto_estado := 'excluida'; NEW.auto_lock_at := NULL; END IF;
 IF TG_OP = 'UPDATE' THEN
  IF v_new_excluded = v_old_excluded OR NOT v_new_excluded THEN NEW.exclusion_por := OLD.exclusion_por; NEW.exclusion_at := OLD.exclusion_at; END IF;
  IF v_new_excluded = v_old_excluded OR v_new_excluded THEN NEW.reinclusion_por := OLD.reinclusion_por; NEW.reinclusion_at := OLD.reinclusion_at; END IF;
 END IF;
 RETURN NEW;
END; $fn$;
CREATE TRIGGER trg_00_facturacion_exclusion_guard BEFORE INSERT OR UPDATE OR DELETE ON public.facturacion_cola FOR EACH ROW EXECUTE FUNCTION public.tg_facturacion_exclusion_guard();
CREATE OR REPLACE FUNCTION public.admin_set_facturacion_exclusion(p_ids uuid[], p_excluir boolean) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_n integer; v_found integer;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()), false) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF p_excluir IS NULL OR p_ids IS NULL OR cardinality(p_ids) = 0 OR array_position(p_ids, NULL) IS NOT NULL THEN RAISE EXCEPTION 'Seleccioná al menos un cobro válido'; END IF;
 PERFORM id FROM public.facturacion_cola WHERE id = ANY(p_ids) ORDER BY id FOR UPDATE;
 SELECT count(*) INTO v_found FROM public.facturacion_cola WHERE id = ANY(p_ids);
 IF v_found <> (SELECT count(DISTINCT x) FROM unnest(p_ids) x) THEN RAISE EXCEPTION 'Hay cobros que ya no existen'; END IF;
 UPDATE public.facturacion_cola SET excluida_facturacion = p_excluir, estado = CASE WHEN p_excluir THEN 'excluida' ELSE 'pendiente' END WHERE id = ANY(p_ids) AND (excluida_facturacion OR estado = 'excluida') IS DISTINCT FROM p_excluir;
 GET DIAGNOSTICS v_n = ROW_COUNT; RETURN v_n;
END; $fn$;
REVOKE ALL ON FUNCTION public.admin_set_facturacion_exclusion(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_facturacion_exclusion(uuid[], boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.tg_factura_exclusion_emision_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE c public.facturacion_cola;
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF OLD.estado = 'emitida' AND OLD.cae IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado AND NEW.cae IS NOT DISTINCT FROM OLD.cae AND NEW.facturacion_cola_id IS NOT DISTINCT FROM OLD.facturacion_cola_id AND NEW.referencia_tipo IS NOT DISTINCT FROM OLD.referencia_tipo AND NEW.referencia_id IS NOT DISTINCT FROM OLD.referencia_id THEN RETURN NEW; END IF;
 END IF;
 FOR c IN SELECT q.* FROM public.facturacion_cola q WHERE q.id = NEW.facturacion_cola_id OR q.factura_id = NEW.id OR (NEW.facturacion_cola_id IS NULL AND q.referencia_tipo = NEW.referencia_tipo AND q.referencia_id = NEW.referencia_id) ORDER BY q.id FOR UPDATE LOOP
  IF c.excluida_facturacion OR c.estado = 'excluida' THEN RAISE EXCEPTION 'Cobro excluido de la cola de facturación: volver a incluir antes de facturar'; END IF;
 END LOOP;
 RETURN NEW;
END; $fn$;
CREATE TRIGGER trg_00_factura_exclusion_emision_guard BEFORE INSERT OR UPDATE ON public.facturas FOR EACH ROW EXECUTE FUNCTION public.tg_factura_exclusion_emision_guard();
REVOKE ALL ON FUNCTION public.tg_facturacion_exclusion_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_factura_exclusion_emision_guard() FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.claim_facturacion_auto(p_limit integer DEFAULT 5) RETURNS SETOF public.facturacion_cola LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
 UPDATE public.facturacion_cola c SET auto_estado = 'error_reintentable', auto_lock_at = NULL, auto_ultimo_error = 'Bloqueo vencido sin resultado', auto_proximo_intento_at = now()
 WHERE c.auto_estado = 'emitiendo' AND c.auto_lock_at < now() - interval '30 minutes' AND c.auto_intentos < 3 AND NOT EXISTS (SELECT 1 FROM public.facturas f WHERE f.facturacion_cola_id = c.id AND (f.estado IN ('emitiendo','emitida') OR f.cae IS NOT NULL OR f.recuperacion_estado = 'incierta'));
 RETURN QUERY UPDATE public.facturacion_cola c SET auto_estado = 'emitiendo', auto_lock_at = now(), auto_intentos = c.auto_intentos + 1, auto_ultimo_intento_at = now()
 WHERE c.id IN (SELECT c2.id FROM public.facturacion_cola c2 JOIN public.emisores_fiscales e ON e.id = c2.emisor_resuelto_id JOIN public.emisor_segmento_config s ON s.emisor_id = e.id AND s.segmento = public._fact_segmento_norm(c2.segmento)
 WHERE c2.estado = 'pendiente' AND NOT c2.excluida_facturacion AND c2.ingreso = 'automatico' AND c2.auto_estado IN ('pendiente','error_reintentable') AND c2.auto_intentos < 3 AND coalesce(c2.auto_proximo_intento_at, '-infinity'::timestamptz) <= now() AND upper(coalesce(c2.moneda,'ARS')) = 'ARS' AND c2.pagado_at IS NOT NULL AND e.activo AND e.facturacion_automatica AND e.facturacion_automatica_desde IS NOT NULL AND s.habilitado AND s.auto_habilitado AND s.auto_desde IS NOT NULL AND c2.pagado_at >= greatest(s.auto_desde, e.facturacion_automatica_desde) AND c2.created_at >= greatest(s.auto_desde, e.facturacion_automatica_desde)
 ORDER BY c2.pagado_at LIMIT greatest(1, least(p_limit, 20)) FOR UPDATE OF c2 SKIP LOCKED) RETURNING c.*;
END; $fn$;