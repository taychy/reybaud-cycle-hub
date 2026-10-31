-- ISOLATED DATABASE ONLY: creates fixture schemas and must never run on the application database.
-- Run in a dedicated empty local database. No live IDs or commercial records.
\set ON_ERROR_STOP on
DO $$ BEGIN IF to_regclass('public.store_cambios') IS NOT NULL THEN RAISE EXCEPTION 'Use an empty isolated database only'; END IF; END $$;
CREATE SCHEMA IF NOT EXISTS public; CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
\set ON_ERROR_STOP on
CREATE TYPE public.app_role AS ENUM ('admin','deposito');
CREATE TYPE public.cambio_metodo AS ENUM ('manual','camioneta');
CREATE TYPE public.cambio_estado AS ENUM ('aprobado','en_deposito','listo_retiro','entregado');
CREATE TYPE public.cambio_reemplazo_estado AS ENUM ('pendiente','enviado','entregado');
CREATE TABLE public.store_products(id uuid primary key, variants jsonb);
CREATE TABLE public.store_cambios(id uuid primary key, tipo text, producto_id uuid, variante_origen jsonb, order_id uuid, compra_id uuid, order_item_id uuid, preorder_id uuid, recibido_en timestamptz, recibido_por uuid, metodo_recepcion public.cambio_metodo, estado public.cambio_estado, motivo text, stock_devuelto_at timestamptz, reemplazo_estado public.cambio_reemplazo_estado, variante_destino jsonb, producto_reemplazo_id uuid, stock_descontado_at timestamptz, metodo_preparacion public.cambio_metodo, metodo_entrega_reemplazo public.cambio_metodo, preparado_por uuid, preparado_at timestamptz, historial jsonb, tipo_placeholder text);
ALTER TABLE public.store_cambios ADD COLUMN producto_recibido_id uuid REFERENCES public.store_products(id), ADD COLUMN variante_recibida jsonb;
CREATE TABLE public.stock_log(id serial, pid uuid, variant jsonb, qty int, reason text, source uuid);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public._build_variant_key(uuid,jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT COALESCE($2,'{}'::jsonb)::text $$;
CREATE FUNCTION public._adjust_product_stock(uuid,jsonb,int,text,uuid,uuid,public.cambio_metodo,uuid) RETURNS void LANGUAGE sql AS $$ INSERT INTO public.stock_log(pid,variant,qty,reason,source) VALUES($1,$2,$3,$4,$5) $$;
-- Legacy function copied from named migration (behavior preserved for test fixture).
CREATE FUNCTION public.deposito_recibir_devolucion(p_cambio_id uuid,p_metodo public.cambio_metodo,p_producto_id uuid,p_variante jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
DECLARE v_uid uuid:=auth.uid(); c public.store_cambios%ROWTYPE;
BEGIN
 IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin'::app_role) OR public.has_role(v_uid,'deposito'::app_role)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT * INTO c FROM public.store_cambios WHERE id=p_cambio_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
 IF c.tipo <> 'cambio' THEN RAISE EXCEPTION 'No requiere devolución física'; END IF;
 IF c.recibido_en IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'ya_recibido',true); END IF;
 IF c.estado NOT IN ('aprobado','en_deposito') THEN RAISE EXCEPTION 'El cambio no está aprobado'; END IF;
 IF p_producto_id IS DISTINCT FROM c.producto_id THEN RAISE EXCEPTION 'La prenda no corresponde al cambio'; END IF;
 IF c.variante_origen IS NOT NULL AND c.variante_origen <> '{}'::jsonb AND public._build_variant_key(c.producto_id,COALESCE(p_variante,'{}'::jsonb)) IS DISTINCT FROM public._build_variant_key(c.producto_id,c.variante_origen) THEN RAISE EXCEPTION 'Talle o color no coinciden con la devolución solicitada'; END IF;
 UPDATE public.store_cambios SET recibido_en=now(),recibido_por=v_uid,metodo_recepcion=p_metodo,estado=CASE WHEN reemplazo_estado IN ('enviado','entregado') THEN 'listo_retiro'::public.cambio_estado ELSE 'en_deposito'::public.cambio_estado END,historial=COALESCE(historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('evento','devolucion_recibida')) WHERE id=p_cambio_id;
 RETURN jsonb_build_object('ok',true,'ya_recibido',false);
END;$function$;
-- Include actual trigger and wrapper verbatim from migration via shell extraction before execution.
CREATE OR REPLACE FUNCTION public.store_cambios_apply_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE v_pid uuid;
BEGIN
 IF NEW.tipo='cambio' AND OLD.recibido_en IS NULL AND NEW.recibido_en IS NOT NULL AND NEW.stock_devuelto_at IS NULL AND NEW.motivo<>'defecto' THEN
  PERFORM public._adjust_product_stock(COALESCE(NEW.producto_recibido_id,NEW.producto_id),COALESCE(NEW.variante_recibida,NEW.variante_origen),1,'cambio_in',NEW.id,NEW.order_id,COALESCE(NEW.metodo_recepcion,'manual'),NEW.recibido_por);
  NEW.stock_devuelto_at:=now();
 END IF;
 IF NEW.stock_descontado_at IS NULL AND NEW.reemplazo_estado IN ('enviado','entregado') AND OLD.reemplazo_estado IS DISTINCT FROM NEW.reemplazo_estado AND NEW.variante_destino IS NOT NULL THEN
  v_pid:=COALESCE(NEW.producto_reemplazo_id,NEW.producto_id);
  PERFORM public._adjust_product_stock(v_pid,NEW.variante_destino,-1,'cambio_out',NEW.id,NEW.order_id,COALESCE(NEW.metodo_preparacion,NEW.metodo_entrega_reemplazo,'manual'),COALESCE(NEW.preparado_por,NEW.recibido_por));
  NEW.stock_descontado_at:=now();
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER store_cambios_apply_stock BEFORE UPDATE ON public.store_cambios FOR EACH ROW EXECUTE FUNCTION public.store_cambios_apply_stock();
CREATE OR REPLACE FUNCTION public.deposito_confirmar_devolucion(p_cambio_id uuid,p_metodo public.cambio_metodo,p_producto_id uuid,p_variante jsonb,p_confirmacion_fisica boolean,p_motivo_discrepancia text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE c public.store_cambios%ROWTYPE; v_uid uuid:=auth.uid(); v_diff boolean; v_specs jsonb; v_spec jsonb; v_result jsonb;
BEGIN
 IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin'::public.app_role) OR public.has_role(v_uid,'deposito'::public.app_role)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT * INTO c FROM public.store_cambios WHERE id=p_cambio_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
 IF c.tipo<>'cambio' THEN RAISE EXCEPTION 'No requiere devolución física'; END IF;
 IF c.recibido_en IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'ya_recibido',true); END IF;
 IF p_confirmacion_fisica IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirmá la recepción física'; END IF;
 IF p_producto_id IS NULL OR p_metodo IS NULL OR jsonb_typeof(p_variante) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Falta identificar la prenda devuelta'; END IF;
 SELECT variants INTO v_specs FROM public.store_products WHERE id=p_producto_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
 IF jsonb_typeof(v_specs)='array' THEN
  FOR v_spec IN SELECT value FROM jsonb_array_elements(v_specs) LOOP
   IF jsonb_typeof(v_spec->'options')='array' AND jsonb_array_length(v_spec->'options')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_spec->'options') o WHERE o=p_variante->>(v_spec->>'name')) THEN RAISE EXCEPTION 'Completá las variantes válidas de la prenda recibida'; END IF;
  END LOOP;
 END IF;
 v_diff:=p_producto_id IS DISTINCT FROM c.producto_id OR (COALESCE(c.variante_origen,'{}'::jsonb)<>'{}'::jsonb AND public._build_variant_key(c.producto_id,p_variante) IS DISTINCT FROM public._build_variant_key(c.producto_id,c.variante_origen));
 IF v_diff AND c.stock_devuelto_at IS NOT NULL THEN RAISE EXCEPTION 'Ingreso de stock preexistente: conciliar discrepancia antes de recibir'; END IF;
 IF v_diff AND length(trim(COALESCE(p_motivo_discrepancia,'')))<3 THEN RAISE EXCEPTION 'Indicá el motivo de la discrepancia física'; END IF;
 UPDATE public.store_cambios SET producto_recibido_id=p_producto_id,variante_recibida=p_variante,
 historial=COALESCE(historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('evento','identificacion_devolucion','at',now(),'by',v_uid,'producto_original_id',c.producto_id,'variante_original',c.variante_origen,'producto_recibido_id',p_producto_id,'variante_recibida',p_variante,'cantidad',1,'order_id',COALESCE(c.order_id,c.compra_id),'order_item_id',c.order_item_id,'preorder_id',c.preorder_id,'discrepancia',v_diff,'motivo',p_motivo_discrepancia,'stock_preexistente',c.stock_devuelto_at IS NOT NULL)) WHERE id=c.id;
 v_result:=public.deposito_recibir_devolucion(c.id,p_metodo,c.producto_id,COALESCE(c.variante_origen,'{}'::jsonb));
 RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.deposito_confirmar_devolucion(uuid,public.cambio_metodo,uuid,jsonb,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.deposito_confirmar_devolucion(uuid,public.cambio_metodo,uuid,jsonb,boolean,text) TO authenticated,service_role;
COMMENT ON FUNCTION public.deposito_confirmar_devolucion(uuid,public.cambio_metodo,uuid,jsonb,boolean,text) IS 'Confirma una unidad física con identidad recibida auditada sin sobrescribir original/reemplazo. Bloquea discrepancias con ingresos históricos; serializa reintentos.';
DO $$
DECLARE orig uuid:='10000000-0000-0000-0000-000000000001'; alt uuid:='20000000-0000-0000-0000-000000000002'; a uuid; n int; r jsonb;
BEGIN
 INSERT INTO store_products VALUES(orig,'[{"name":"size","options":["M","L"]}]'),(alt,'[{"name":"size","options":["M","L"]}]');
 -- regular return: legacy call causes trigger +1 exactly once
 INSERT INTO store_cambios(id,tipo,producto_id,variante_origen,estado,motivo,reemplazo_estado) VALUES('00000000-0000-0000-0000-000000000011','cambio',orig,'{"size":"M"}','aprobado','cambio','pendiente');
 PERFORM deposito_confirmar_devolucion('00000000-0000-0000-0000-000000000011','manual',orig,'{"size":"M"}',true);
 IF (SELECT sum(qty) FROM stock_log)<>1 THEN RAISE EXCEPTION 'original return expected +1'; END IF;
 PERFORM deposito_confirmar_devolucion('00000000-0000-0000-0000-000000000011','manual',orig,'{"size":"M"}',true);
 IF (SELECT sum(qty) FROM stock_log)<>1 THEN RAISE EXCEPTION 'retry duplicated'; END IF;
 -- discrepancy physically adds received identity, leaving ordered/replacement identities untouched
 INSERT INTO store_cambios(id,tipo,producto_id,variante_origen,estado,motivo,reemplazo_estado,producto_reemplazo_id,variante_destino) VALUES('00000000-0000-0000-0000-000000000012','cambio',orig,'{"size":"M"}','aprobado','cambio','pendiente',alt,'{"size":"L"}');
 PERFORM deposito_confirmar_devolucion('00000000-0000-0000-0000-000000000012','manual',alt,'{"size":"L"}',true,'Recibido distinto');
 IF (SELECT count(*) FROM stock_log WHERE source='00000000-0000-0000-0000-000000000012' AND qty=1 AND pid=alt AND variant='{"size":"L"}')<>1 THEN RAISE EXCEPTION 'discrepancy physical identity not stocked'; END IF;
 IF (SELECT producto_id FROM store_cambios WHERE id='00000000-0000-0000-0000-000000000012')<>orig OR (SELECT producto_reemplazo_id FROM store_cambios WHERE id='00000000-0000-0000-0000-000000000012')<>alt OR (SELECT variante_destino FROM store_cambios WHERE id='00000000-0000-0000-0000-000000000012')<>'{"size":"L"}' THEN RAISE EXCEPTION 'original/replacement mutated'; END IF;
 -- Separate unreceived fixture for rejection tests.
 INSERT INTO store_cambios(id,tipo,producto_id,variante_origen,estado,motivo,reemplazo_estado) VALUES('00000000-0000-0000-0000-000000000016','cambio',orig,'{"size":"M"}','aprobado','cambio','pendiente');
 BEGIN PERFORM deposito_confirmar_devolucion('00000000-0000-0000-0000-000000000016','manual',alt,'{"size":"L"}',false,'why'); RAISE EXCEPTION 'false physical accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='false physical accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM deposito_confirmar_devolucion('00000000-0000-0000-0000-000000000016','manual',alt,'{"size":"L"}',true,NULL); RAISE EXCEPTION 'missing reason accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='missing reason accepted' THEN RAISE; END IF; END;
 -- historical marker: discrepancy raises and contributes no stock
 INSERT INTO store_cambios(id,tipo,producto_id,variante_origen,estado,motivo,reemplazo_estado,stock_devuelto_at) VALUES('00000000-0000-0000-0000-000000000013','cambio',orig,'{"size":"M"}','aprobado','cambio','pendiente',now());
 n:=(SELECT count(*) FROM stock_log);
 BEGIN PERFORM deposito_confirmar_devolucion('00000000-0000-0000-0000-000000000013','manual',alt,'{"size":"L"}',true,'wrong garment'); RAISE EXCEPTION 'historic marker accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='historic marker accepted' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM stock_log)<>n THEN RAISE EXCEPTION 'historic marker added stock'; END IF;
 PERFORM deposito_confirmar_devolucion('00000000-0000-0000-0000-000000000013','manual',orig,'{"size":"M"}',true);
 IF (SELECT count(*) FROM stock_log)<>n THEN RAISE EXCEPTION 'historic same identity duplicated stock'; END IF;
 -- defect has no stock
 INSERT INTO store_cambios(id,tipo,producto_id,variante_origen,estado,motivo,reemplazo_estado) VALUES('00000000-0000-0000-0000-000000000014','cambio',orig,'{"size":"M"}','aprobado','defecto','pendiente');
 PERFORM deposito_confirmar_devolucion('00000000-0000-0000-0000-000000000014','manual',orig,'{"size":"M"}',true);
 IF (SELECT count(*) FROM stock_log)<>n THEN RAISE EXCEPTION 'defect added stock'; END IF;
 -- invalid variant rejected
 INSERT INTO store_cambios(id,tipo,producto_id,variante_origen,estado,motivo,reemplazo_estado) VALUES('00000000-0000-0000-0000-000000000015','cambio',orig,'{"size":"M"}','aprobado','cambio','pendiente');
 BEGIN PERFORM deposito_confirmar_devolucion('00000000-0000-0000-0000-000000000015','manual',orig,'{"size":"XL"}',true); RAISE EXCEPTION 'invalid variant accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='invalid variant accepted' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS: stock movements total %, original counts %, discrepancy counts %, defect/historic no increments', (SELECT count(*) FROM stock_log),(SELECT count(*) FROM stock_log WHERE source='00000000-0000-0000-0000-000000000011'),(SELECT count(*) FROM stock_log WHERE source='00000000-0000-0000-0000-000000000012');
END $$;
SELECT reason,qty,pid,variant FROM stock_log ORDER BY id;
