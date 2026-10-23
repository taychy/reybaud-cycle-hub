-- Availability uses consumed value; statements use already recognized income.
CREATE OR REPLACE FUNCTION public.pago_monto_reconocido_cc(_tipo text, _id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT GREATEST(public.pago_monto_legacy(_tipo,_id), COALESCE((
 SELECT mp.amount FROM public.mp_account_movements mp JOIN public.suscripciones s ON s.id=mp.suscripcion_id
 WHERE _tipo='mp_movement' AND mp.id=_id AND mp.status='approved'
 AND s.cancelada_at IS NULL AND s.estado IN ('activa','pendiente_verificacion','vencida','finalizada','conciliado')
 AND public.is_subscription_paid(s.id,s.metodo_pago,s.mp_status,s.origen_registro,s.chequeado_admin,s.mp_payment_id)
 ),0));
$$;
REVOKE ALL ON FUNCTION public.pago_monto_reconocido_cc(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pago_monto_reconocido_cc(text,uuid) TO authenticated,service_role;
DO $view$ DECLARE d text; needle text:='pago_monto_legacy(pi.pago_origen_tipo, pi.pago_origen_id)'; BEGIN
 d:=pg_get_viewdef('public.vw_cuenta_corriente_movimientos'::regclass,true);
 IF strpos(d,needle)=0 THEN RAISE EXCEPTION 'Unexpected 0083 statement overlap'; END IF;
 d:=replace(d,needle,'pago_monto_reconocido_cc(pi.pago_origen_tipo, pi.pago_origen_id)');
 EXECUTE 'CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos WITH(security_invoker=true) AS '||d;
END $view$;
CREATE OR REPLACE FUNCTION public.guard_credit_mp_budget() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE mp record; credits numeric; used numeric; changes_income boolean:=true;
BEGIN
 IF NEW.tipo<>'credito' OR NEW.referencia_externa IS NULL OR NEW.cuenta_mp_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO mp FROM public.mp_account_movements WHERE mp_payment_id=NEW.referencia_externa
 AND cuenta_mp_id=NEW.cuenta_mp_id AND upper(currency)=upper(NEW.moneda)
 AND status='approved' AND direccion='ingreso' FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN changes_income:=(NEW.tipo,NEW.referencia_externa,NEW.cuenta_mp_id,upper(NEW.moneda))
 IS DISTINCT FROM (OLD.tipo,OLD.referencia_externa,OLD.cuenta_mp_id,upper(OLD.moneda)) OR NEW.monto>OLD.monto; END IF;
 IF changes_income AND mp.suscripcion_id IS NOT NULL THEN
 RAISE EXCEPTION 'mp_income_already_linked_to_subscription: el ingreso ya está contabilizado en una suscripción; no cree otro crédito'; END IF;
 SELECT COALESCE(sum(monto),0) INTO credits FROM public.cuenta_ajustes WHERE tipo='credito'
 AND referencia_externa=NEW.referencia_externa AND cuenta_mp_id=NEW.cuenta_mp_id
 AND upper(moneda)=upper(NEW.moneda) AND id<>NEW.id;
 used:=public.pago_monto_imputado('mp_movement',mp.id);
 IF credits+NEW.monto+used>mp.amount+0.01 THEN RAISE EXCEPTION 'mp_credit_budget_exceeded'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_mp_legacy_vs_imputations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF (NEW.suscripcion_id,NEW.reservation_payment_id) IS DISTINCT FROM (OLD.suscripcion_id,OLD.reservation_payment_id)
 AND (NEW.suscripcion_id IS NOT NULL OR NEW.reservation_payment_id IS NOT NULL)
 AND public.pago_monto_imputado('mp_movement',NEW.id)>0 THEN RAISE EXCEPTION 'movement_has_active_imputations'; END IF;
 IF NEW.suscripcion_id IS NOT NULL AND NEW.suscripcion_id IS DISTINCT FROM OLD.suscripcion_id
 AND EXISTS(SELECT 1 FROM public.cuenta_ajustes ca WHERE ca.tipo='credito' AND ca.monto>0
 AND ca.referencia_externa=NEW.mp_payment_id AND ca.cuenta_mp_id=NEW.cuenta_mp_id
 AND upper(ca.moneda)=upper(NEW.currency)
 AND (ca.aplicado_a_fuente_tabla IS DISTINCT FROM 'suscripciones' OR ca.aplicado_a_fuente_id IS DISTINCT FROM NEW.suscripcion_id))
 THEN RAISE EXCEPTION 'movement_has_existing_credit: aplique el crédito existente desde cuenta corriente'; END IF;
 RETURN NEW;
END $$;
-- Reject the direct RPC before it edits the subscription; keep the audited credit-application RPC unchanged.
DO $rpc$ DECLARE d text; needle text:=$old$  ELSIF _target_type = 'suscripcion' THEN$old$; BEGIN
 d:=pg_get_functiondef('public.assign_mp_movement_to_target(uuid,uuid,text,uuid,text)'::regprocedure);
 IF strpos(d,needle)=0 THEN RAISE EXCEPTION 'Unexpected assignment subscription branch'; END IF;
 d:=replace(d,needle,needle||$new$
    IF public.pago_credito_representado(_movement_id)>0 THEN
      RAISE EXCEPTION 'movement_has_existing_credit: aplique el crédito existente desde cuenta corriente';
    END IF;
$new$); EXECUTE d;
END $rpc$;
-- The target owner remains mandatory; authorized administrative family splits do not require source ownership.
DO $guard$ DECLARE d text; needle text:='mp.alumno_id IS DISTINCT FROM NEW.alumno_id OR upper(mp.currency) IS DISTINCT FROM upper(NEW.moneda)'; BEGIN
 d:=pg_get_functiondef('public.guard_pagos_imputaciones()'::regprocedure);
 IF strpos(d,needle)=0 THEN RAISE EXCEPTION 'Unexpected source identity guard'; END IF;
 d:=replace(d,needle,'(mp.alumno_id IS DISTINCT FROM NEW.alumno_id AND NOT (public.has_role(auth.uid(),''admin''::public.app_role) OR public.is_super_admin(auth.uid()))) OR upper(mp.currency) IS DISTINCT FROM upper(NEW.moneda)');
 EXECUTE d;
END $guard$;