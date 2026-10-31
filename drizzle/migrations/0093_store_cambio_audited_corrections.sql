CREATE OR REPLACE FUNCTION public.can_correct_store_cambio() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'admin'::public.app_role) AND EXISTS(SELECT 1 FROM public.admin_profiles WHERE user_id=auth.uid() AND status='active' AND role IN ('admin'::public.admin_role,'super_admin'::public.admin_role)) $$;
REVOKE ALL ON FUNCTION public.can_correct_store_cambio() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_correct_store_cambio() TO authenticated;
ALTER TABLE public.store_cambios ADD COLUMN correccion_administrativa jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN correccion_revision bigint NOT NULL DEFAULT 0;
CREATE TABLE public.store_cambio_corrections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cambio_id uuid NOT NULL REFERENCES public.store_cambios(id), actor_id uuid NOT NULL, actor_label text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL CHECK(length(trim(reason))>0), kind text NOT NULL CHECK(kind IN ('administrativa','compensacion_stock')), request_id uuid NOT NULL UNIQUE, before_data jsonb NOT NULL, after_data jsonb NOT NULL, operational_snapshot jsonb NOT NULL, revision bigint, source_movement_id uuid REFERENCES public.stock_movements(id), reverse_movement_id uuid REFERENCES public.stock_movements(id), replacement_movement_id uuid REFERENCES public.stock_movements(id));
GRANT SELECT ON public.store_cambio_corrections TO authenticated;
GRANT ALL ON public.store_cambio_corrections TO service_role;
ALTER TABLE public.store_cambio_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_reads_cambio_corrections ON public.store_cambio_corrections FOR SELECT TO authenticated USING(public.can_correct_store_cambio());
CREATE UNIQUE INDEX store_cambio_compensation_once ON public.store_cambio_corrections(source_movement_id) WHERE kind='compensacion_stock';
CREATE INDEX store_cambio_correction_history ON public.store_cambio_corrections(cambio_id,created_at);
CREATE OR REPLACE FUNCTION public.store_cambio_corrections_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'El historial de correcciones es inalterable'; END $$;
CREATE TRIGGER store_cambio_corrections_immutable BEFORE UPDATE OR DELETE ON public.store_cambio_corrections FOR EACH ROW EXECUTE FUNCTION public.store_cambio_corrections_immutable();
CREATE OR REPLACE FUNCTION public.store_cambio_correction_product(p_product uuid,p_variant jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$ DECLARE specs jsonb; spec jsonb; BEGIN
IF p_product IS NULL OR jsonb_typeof(p_variant) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Identificá producto y variante'; END IF;
SELECT variants INTO specs FROM public.store_products WHERE id=p_product; IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
IF jsonb_typeof(specs)='array' THEN FOR spec IN SELECT value FROM jsonb_array_elements(specs) LOOP
IF jsonb_typeof(spec->'options')='array' AND jsonb_array_length(spec->'options')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(spec->'options') opt WHERE opt=p_variant->>(spec->>'name')) THEN RAISE EXCEPTION 'Completá talle/color válidos para el producto'; END IF; END LOOP; END IF;
IF EXISTS(SELECT 1 FROM jsonb_each(p_variant) kv WHERE jsonb_typeof(kv.value)<>'string') THEN RAISE EXCEPTION 'Variante inválida'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.store_cambio_correction_product(uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.admin_correct_store_cambio(p_cambio_id uuid,p_patch jsonb,p_reason text,p_confirm boolean,p_request_id uuid,p_expected_updated_at timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.store_cambios%ROWTYPE; e public.store_cambio_corrections%ROWTYPE; b jsonb; a jsonb; k text; eid uuid:=gen_random_uuid(); who text;
BEGIN
IF NOT public.can_correct_store_cambio() THEN RAISE EXCEPTION 'Solo admin/superadmin pueden corregir registros'; END IF;
IF p_confirm IS DISTINCT FROM true OR length(trim(COALESCE(p_reason,'')))=0 OR p_request_id IS NULL THEN RAISE EXCEPTION 'Motivo y confirmación explícita obligatorios'; END IF;
SELECT * INTO c FROM public.store_cambios WHERE id=p_cambio_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
SELECT * INTO e FROM public.store_cambio_corrections WHERE request_id=p_request_id;
IF FOUND THEN IF e.cambio_id<>c.id OR e.actor_id<>auth.uid() OR e.kind<>'administrativa' OR e.reason<>trim(p_reason) OR (e.before_data||p_patch) IS DISTINCT FROM e.after_data THEN RAISE EXCEPTION 'Solicitud de idempotencia incompatible'; END IF; RETURN jsonb_build_object('id',e.id,'reintento',true); END IF;
IF c.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'El registro cambió. Reabrí el detalle antes de corregir'; END IF;
IF c.tipo<>'cambio' THEN RAISE EXCEPTION 'Esta corrección solo admite cambios de indumentaria'; END IF;
IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch='{}'::jsonb THEN RAISE EXCEPTION 'No hay cambios'; END IF;
FOR k IN SELECT jsonb_object_keys(p_patch) LOOP IF k NOT IN ('producto_id','producto_reemplazo_id','variante_origen','variante_destino','recepcion_estado','recepcion_fecha','comentario','motivo_admin') THEN RAISE EXCEPTION 'Campo no corregible: %',k; END IF; END LOOP;
b:=jsonb_build_object('producto_id',c.producto_id,'producto_reemplazo_id',COALESCE(c.producto_reemplazo_id,c.producto_id),'variante_origen',COALESCE(c.variante_origen,'{}'::jsonb),'variante_destino',COALESCE(c.variante_destino,'{}'::jsonb),'recepcion_estado',CASE WHEN c.recibido_en IS NULL THEN 'pendiente' ELSE 'recibida' END,'recepcion_fecha',c.recibido_en,'comentario',COALESCE(c.comentario,''),'motivo_admin',COALESCE(c.motivo_admin,''))||c.correccion_administrativa;
a:=b||p_patch; IF a=b THEN RAISE EXCEPTION 'No hay diferencias'; END IF;
IF p_patch ? 'producto_id' OR p_patch ? 'variante_origen' THEN PERFORM public.store_cambio_correction_product((a->>'producto_id')::uuid,a->'variante_origen'); END IF;
IF p_patch ? 'producto_reemplazo_id' OR p_patch ? 'variante_destino' THEN PERFORM public.store_cambio_correction_product((a->>'producto_reemplazo_id')::uuid,a->'variante_destino'); END IF;
IF (a->>'recepcion_estado') IS NULL OR a->>'recepcion_estado' NOT IN ('pendiente','recibida') THEN RAISE EXCEPTION 'Recepción declarada inválida'; END IF;
IF a->>'recepcion_estado'='pendiente' AND a->>'recepcion_fecha' IS NOT NULL THEN RAISE EXCEPTION 'Recepción pendiente sin fecha'; END IF;
IF a->>'recepcion_estado'='recibida' THEN IF a->>'recepcion_fecha' IS NULL OR (a->>'recepcion_fecha')::timestamptz>now() THEN RAISE EXCEPTION 'Fecha de recepción obligatoria y no futura'; END IF; END IF;
IF jsonb_typeof(a->'comentario')<>'string' OR jsonb_typeof(a->'motivo_admin')<>'string' OR length(a->>'comentario')>4000 OR length(a->>'motivo_admin')>4000 THEN RAISE EXCEPTION 'Descripción inválida o demasiado larga'; END IF;
SELECT trim(COALESCE(first_name,'')||' '||COALESCE(last_name,'')) INTO who FROM public.admin_profiles WHERE user_id=auth.uid();
INSERT INTO public.store_cambio_corrections(id,cambio_id,actor_id,actor_label,reason,kind,request_id,before_data,after_data,operational_snapshot,revision) VALUES(eid,c.id,auth.uid(),COALESCE(NULLIF(who,''),'Administrador'),trim(p_reason),'administrativa',p_request_id,b,a,to_jsonb(c),c.correccion_revision+1);
UPDATE public.store_cambios SET correccion_administrativa=a,correccion_revision=c.correccion_revision+1 WHERE id=c.id;
RETURN jsonb_build_object('id',eid,'sin_stock',true,'revision',c.correccion_revision+1);
END $$;
REVOKE ALL ON FUNCTION public.admin_correct_store_cambio(uuid,jsonb,text,boolean,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_correct_store_cambio(uuid,jsonb,text,boolean,uuid,timestamptz) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_compensate_store_cambio(p_cambio_id uuid,p_source_id uuid,p_product_id uuid,p_variant jsonb,p_reason text,p_confirm boolean,p_request_id uuid,p_expected_updated_at timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.store_cambios%ROWTYPE; s public.stock_movements%ROWTYPE; e public.store_cambio_corrections%ROWTYPE; delta integer; rev uuid; repl uuid; eid uuid:=gen_random_uuid(); who text; target_key text;
BEGIN
IF NOT public.can_correct_store_cambio() THEN RAISE EXCEPTION 'Solo admin/superadmin pueden compensar inventario'; END IF;
IF p_confirm IS DISTINCT FROM true OR length(trim(COALESCE(p_reason,'')))=0 OR p_request_id IS NULL THEN RAISE EXCEPTION 'Motivo y confirmación física explícita obligatorios'; END IF;
SELECT * INTO c FROM public.store_cambios WHERE id=p_cambio_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
SELECT * INTO e FROM public.store_cambio_corrections WHERE request_id=p_request_id;
IF FOUND THEN IF e.cambio_id<>c.id OR e.actor_id<>auth.uid() OR e.kind<>'compensacion_stock' OR e.source_movement_id<>p_source_id OR e.reason<>trim(p_reason) OR e.after_data->>'product_id' IS DISTINCT FROM p_product_id::text OR e.after_data->'variant' IS DISTINCT FROM p_variant THEN RAISE EXCEPTION 'Solicitud de idempotencia incompatible'; END IF; RETURN jsonb_build_object('id',e.id,'reintento',true); END IF;
IF c.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'El registro cambió. Reabrí el detalle'; END IF;
IF c.tipo<>'cambio' THEN RAISE EXCEPTION 'Solo cambios de indumentaria'; END IF;
SELECT * INTO s FROM public.stock_movements WHERE id=p_source_id AND cambio_id=c.id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no vinculado al cambio'; END IF;
IF s.motivo NOT IN ('cambio_in','cambio_out') OR s.tipo NOT IN ('ingreso','egreso') OR s.cantidad<>1 THEN RAISE EXCEPTION 'Solo un movimiento original de una unidad; otros requieren conciliación especializada'; END IF;
IF EXISTS(SELECT 1 FROM public.store_cambio_corrections WHERE source_movement_id=s.id) OR EXISTS(SELECT 1 FROM public.stock_movements WHERE reversa_de_movimiento_id=s.id) THEN RAISE EXCEPTION 'Movimiento ya compensado'; END IF;
PERFORM public.store_cambio_correction_product(p_product_id,p_variant); target_key:=public._build_variant_key(p_product_id,p_variant);
IF p_product_id=s.product_id AND target_key IS NOT DISTINCT FROM s.variante THEN RAISE EXCEPTION 'No hay diferencia física'; END IF;
PERFORM 1 FROM public.store_products WHERE id IN (s.product_id,p_product_id) ORDER BY id FOR UPDATE;
delta:=CASE WHEN s.tipo='ingreso' THEN 1 ELSE -1 END;
rev:=public.adjust_store_stock(s.product_id,s.variante,-delta,'compensacion_cambio_reversa',s.order_id,auth.uid(),s.order_item_id,s.id,true,'manual'::public.cambio_metodo,c.id);
repl:=public.adjust_store_stock(p_product_id,target_key,delta,'compensacion_cambio_corregida',s.order_id,auth.uid(),s.order_item_id,NULL,true,'manual'::public.cambio_metodo,c.id);
IF rev IS NULL OR repl IS NULL THEN RAISE EXCEPTION 'No se pudieron crear ambos movimientos'; END IF;
SELECT trim(COALESCE(first_name,'')||' '||COALESCE(last_name,'')) INTO who FROM public.admin_profiles WHERE user_id=auth.uid();
INSERT INTO public.store_cambio_corrections(id,cambio_id,actor_id,actor_label,reason,kind,request_id,before_data,after_data,operational_snapshot,source_movement_id,reverse_movement_id,replacement_movement_id) VALUES(eid,c.id,auth.uid(),COALESCE(NULLIF(who,''),'Administrador'),trim(p_reason),'compensacion_stock',p_request_id,to_jsonb(s),jsonb_build_object('product_id',p_product_id,'variant',p_variant,'delta',delta,'reverse_id',rev,'replacement_id',repl),to_jsonb(c),s.id,rev,repl);
RETURN jsonb_build_object('id',eid,'reverse_id',rev,'replacement_id',repl);
END $$;
REVOKE ALL ON FUNCTION public.admin_compensate_store_cambio(uuid,uuid,uuid,jsonb,text,boolean,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_compensate_store_cambio(uuid,uuid,uuid,jsonb,text,boolean,uuid,timestamptz) TO authenticated;
CREATE OR REPLACE FUNCTION public.store_cambio_correction_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.correccion_administrativa IS DISTINCT FROM OLD.correccion_administrativa OR NEW.correccion_revision IS DISTINCT FROM OLD.correccion_revision THEN
IF NOT public.can_correct_store_cambio() OR NEW.correccion_revision<>OLD.correccion_revision+1 OR NOT EXISTS(SELECT 1 FROM public.store_cambio_corrections e WHERE e.cambio_id=OLD.id AND e.actor_id=auth.uid() AND e.kind='administrativa' AND e.revision=NEW.correccion_revision AND e.after_data=NEW.correccion_administrativa AND e.operational_snapshot=to_jsonb(OLD)) THEN RAISE EXCEPTION 'Corrección solo mediante registro auditado'; END IF;
END IF;
IF (COALESCE(OLD.historial,'[]'::jsonb) <> '[]'::jsonb) AND (jsonb_typeof(NEW.historial) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.historial)<jsonb_array_length(OLD.historial) OR EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.historial) WITH ORDINALITY h(val,idx) WHERE NEW.historial->((h.idx-1)::integer) IS DISTINCT FROM h.val)) THEN RAISE EXCEPTION 'No se puede reescribir el historial'; END IF;
IF OLD.stock_devuelto_at IS NOT NULL AND NEW.stock_devuelto_at IS DISTINCT FROM OLD.stock_devuelto_at OR OLD.stock_descontado_at IS NOT NULL AND NEW.stock_descontado_at IS DISTINCT FROM OLD.stock_descontado_at THEN RAISE EXCEPTION 'No se pueden reiniciar movimientos de stock'; END IF;
IF (OLD.stock_devuelto_at IS NOT NULL OR OLD.stock_descontado_at IS NOT NULL OR OLD.recibido_en IS NOT NULL OR OLD.preparado_at IS NOT NULL OR OLD.reemplazo_entregado_at IS NOT NULL OR OLD.estado IN ('entregado','cancelado','rechazado')) AND (NEW.producto_id IS DISTINCT FROM OLD.producto_id OR NEW.variante_origen IS DISTINCT FROM OLD.variante_origen) THEN RAISE EXCEPTION 'Original histórico protegido; usá corrección administrativa o compensación separada'; END IF;
IF (OLD.stock_descontado_at IS NOT NULL OR OLD.preparado_at IS NOT NULL OR OLD.reemplazo_entregado_at IS NOT NULL OR OLD.estado IN ('entregado','cancelado','rechazado')) AND (NEW.producto_reemplazo_id IS DISTINCT FROM OLD.producto_reemplazo_id OR NEW.variante_destino IS DISTINCT FROM OLD.variante_destino) THEN RAISE EXCEPTION 'Reemplazo histórico protegido'; END IF;
IF OLD.recibido_en IS NOT NULL AND (NEW.recibido_en IS DISTINCT FROM OLD.recibido_en OR NEW.producto_recibido_id IS DISTINCT FROM OLD.producto_recibido_id OR NEW.variante_recibida IS DISTINCT FROM OLD.variante_recibida) THEN RAISE EXCEPTION 'Recepción histórica protegida'; END IF;
RETURN NEW; END $$;
CREATE TRIGGER zzzz_store_cambio_correction_guard BEFORE UPDATE ON public.store_cambios FOR EACH ROW EXECUTE FUNCTION public.store_cambio_correction_guard();
COMMENT ON COLUMN public.store_cambios.correccion_administrativa IS 'Administrative declarations only; never used for stock, labels, order identities or workflow transitions.';
COMMENT ON TABLE public.store_cambio_corrections IS 'Append-only administrative corrections and explicit source-linked atomic inventory compensations; no real corrections are seeded.';