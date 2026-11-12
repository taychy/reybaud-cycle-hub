-- Recognize a legacy subscription payment only up to its obligation; the remainder stays distributable.
CREATE OR REPLACE FUNCTION public.pago_monto_reconocido_cc(_tipo text, _id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT GREATEST(public.pago_monto_legacy(_tipo,_id), COALESCE((
 SELECT LEAST(mp.amount, COALESCE(public.obligacion_monto('suscripcion',s.id),0))
 FROM public.mp_account_movements mp JOIN public.suscripciones s ON s.id=mp.suscripcion_id
 WHERE _tipo='mp_movement' AND mp.id=_id AND mp.status='approved'
 AND s.cancelada_at IS NULL AND s.estado IN ('activa','pendiente_verificacion','vencida','finalizada','conciliado')
 AND public.is_subscription_paid(s.id,s.metodo_pago,s.mp_status,s.origen_registro,s.chequeado_admin,s.mp_payment_id)
 ),0));
$$;
REVOKE ALL ON FUNCTION public.pago_monto_reconocido_cc(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pago_monto_reconocido_cc(text,uuid) TO authenticated,service_role;

DO $view$
DECLARE d text; needle text; replacement text;
BEGIN
 d:=pg_get_viewdef('public.vw_cuenta_corriente_movimientos'::regclass,true);
 needle:=$old$COALESCE(mp.amount, 0::numeric) AS haber,
    COALESCE(p.moneda, 'ARS'::text) AS moneda,$old$;
 replacement:=$new$LEAST(COALESCE(mp.amount, 0::numeric), COALESCE(public.obligacion_monto('suscripcion', s.id), 0::numeric)) AS haber,
    COALESCE(p.moneda, 'ARS'::text) AS moneda,$new$;
 IF strpos(d,needle)=0 THEN RAISE EXCEPTION 'Unexpected MP subscription statement branch'; END IF;
 d:=replace(d,needle,replacement);
 EXECUTE 'CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos WITH(security_invoker=true) AS '||d;
END $view$;

CREATE OR REPLACE FUNCTION public.imputar_pago_en_deudas(
 _pago_origen_tipo text,
 _pago_origen_id uuid,
 _deudas jsonb,
 _lote_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_alumno uuid; v_moneda text; v_bruto numeric; v_disponible numeric;
 v_item jsonb; v_tipo text; v_obligacion_id uuid; v_monto numeric;
 v_ob_alumno uuid; v_ob_moneda text; v_pend numeric;
 v_existing public.pagos_imputaciones; v_id uuid;
 v_seen text[] := ARRAY[]::text[]; v_key text;
 v_total numeric:=0; v_nuevo numeric:=0; v_existente numeric:=0;
 v_result jsonb:='[]'::jsonb; v_metadata jsonb;
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) THEN
  RAISE EXCEPTION 'not_authorized';
 END IF;
 IF _pago_origen_tipo<>'mp_movement' THEN RAISE EXCEPTION 'unsupported_payment_source'; END IF;
 IF _deudas IS NULL OR jsonb_typeof(_deudas)<>'array' OR jsonb_array_length(_deudas)=0 THEN
  RAISE EXCEPTION 'empty_debt_list';
 END IF;
 IF jsonb_array_length(_deudas)>25 THEN RAISE EXCEPTION 'too_many_debts'; END IF;
 IF _lote_id IS NOT NULL AND (length(_lote_id)>100 OR btrim(_lote_id)='') THEN
  RAISE EXCEPTION 'invalid_batch_id';
 END IF;

 SELECT mp.alumno_id,upper(mp.currency),mp.amount INTO v_alumno,v_moneda,v_bruto
 FROM public.mp_account_movements mp
 WHERE mp.id=_pago_origen_id AND mp.status='approved' AND mp.direccion='ingreso'
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'approved_income_not_found'; END IF;
 IF v_alumno IS NULL THEN RAISE EXCEPTION 'payment_student_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('imputation:source:'||_pago_origen_tipo||':'||_pago_origen_id,0));
 v_disponible:=public.pago_saldo_disponible(_pago_origen_tipo,_pago_origen_id);

 FOR v_item IN SELECT value FROM jsonb_array_elements(_deudas) LOOP
  IF jsonb_typeof(v_item)<>'object' OR jsonb_typeof(v_item->'monto')<>'number' THEN
   RAISE EXCEPTION 'invalid_debt_item';
  END IF;
  v_tipo:=public.obligacion_tipo_normalizado(v_item->>'obligacion_tipo');
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'invalid_obligation_type'; END IF;
  BEGIN
   v_obligacion_id:=(v_item->>'obligacion_id')::uuid;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_obligation_id'; END;
  v_monto:=round((v_item->>'monto')::numeric,2);
  IF v_monto IS NULL OR v_monto<=0 THEN RAISE EXCEPTION 'invalid_imputation_amount'; END IF;
  v_key:=v_tipo||':'||v_obligacion_id::text;
  IF v_seen @> ARRAY[v_key] THEN RAISE EXCEPTION 'duplicate_obligation_in_request'; END IF;
  v_seen:=v_seen||v_key;
  v_total:=v_total+v_monto;

  SELECT * INTO v_existing FROM public.pagos_imputaciones pi
  WHERE pi.pago_origen_tipo=_pago_origen_tipo AND pi.pago_origen_id=_pago_origen_id
   AND pi.obligacion_tipo=v_tipo AND pi.obligacion_id=v_obligacion_id AND pi.anulado_at IS NULL
  LIMIT 1;
  IF FOUND THEN
   IF round(v_existing.monto,2)<>v_monto THEN RAISE EXCEPTION 'existing_imputation_different_amount'; END IF;
   v_existente:=v_existente+v_monto;
   v_result:=v_result||jsonb_build_object('imputacion_id',v_existing.id,'obligacion_tipo',v_tipo,
    'obligacion_id',v_obligacion_id,'monto',v_monto,'existente',true);
   CONTINUE;
  END IF;

  v_ob_alumno:=public.obligacion_alumno(v_tipo,v_obligacion_id);
  IF v_ob_alumno IS NULL OR v_ob_alumno<>v_alumno THEN RAISE EXCEPTION 'obligation_identity_mismatch'; END IF;
  v_ob_moneda:=public.obligacion_moneda(v_tipo,v_obligacion_id);
  IF v_ob_moneda IS NULL OR upper(v_ob_moneda)<>v_moneda THEN RAISE EXCEPTION 'obligation_currency_mismatch'; END IF;
  v_pend:=public.obligacion_saldo_pendiente(v_tipo,v_obligacion_id);
  IF v_pend IS NULL OR v_pend<=0 THEN RAISE EXCEPTION 'obligation_closed_or_paid'; END IF;
  IF v_monto>v_pend+0.01 THEN RAISE EXCEPTION 'obligation_already_paid_or_overallocated'; END IF;
  v_nuevo:=v_nuevo+v_monto;
  IF v_nuevo>v_disponible+0.01 THEN RAISE EXCEPTION 'payment_already_represented_or_overallocated'; END IF;

  v_metadata:=jsonb_build_object('origen','saldo_disponible_multi','lote_id',_lote_id);
  v_id:=public.imputar_pago(_pago_origen_tipo,_pago_origen_id,v_tipo,v_obligacion_id,
   v_alumno,v_monto,v_moneda,v_metadata);
  v_result:=v_result||jsonb_build_object('imputacion_id',v_id,'obligacion_tipo',v_tipo,
   'obligacion_id',v_obligacion_id,'monto',v_monto,'existente',false);
 END LOOP;

 INSERT INTO public.audit_log(user_id,user_email,user_role,action,entity_type,entity_id,details)
 VALUES(auth.uid(),NULL,'admin','imputar_pago_en_deudas','mp_account_movements',_pago_origen_id::text,
 jsonb_build_object('lote_id',_lote_id,'alumno_id',v_alumno,'moneda',v_moneda,
 'ingreso_total',v_bruto,'disponible_antes',v_disponible,'total_solicitado',v_total,
 'total_nuevo',v_nuevo,'total_ya_existente',v_existente,'imputaciones',v_result,
 'disponible_despues',public.pago_saldo_disponible(_pago_origen_tipo,_pago_origen_id)));

 RETURN jsonb_build_object('alumno_id',v_alumno,'moneda',v_moneda,'ingreso_total',v_bruto,
 'disponible_antes',v_disponible,'disponible_despues',public.pago_saldo_disponible(_pago_origen_tipo,_pago_origen_id),
 'total_nuevo',v_nuevo,'total_ya_existente',v_existente,'imputaciones',v_result);
END $$;
REVOKE ALL ON FUNCTION public.imputar_pago_en_deudas(text,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.imputar_pago_en_deudas(text,uuid,jsonb,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.run_mp_multi_debt_regression_tests()
RETURNS TABLE(test integer,estado text,nombre text,detalle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_out jsonb:='[]'::jsonb; v_cta uuid;
 v_a1 uuid:=gen_random_uuid(); v_a2 uuid:=gen_random_uuid();
 v_pa uuid:=gen_random_uuid(); v_pb uuid:=gen_random_uuid(); v_pc uuid:=gen_random_uuid(); v_pu uuid:=gen_random_uuid();
 v_s1 uuid:=gen_random_uuid(); v_s2 uuid:=gen_random_uuid(); v_s3 uuid:=gen_random_uuid(); v_s4 uuid:=gen_random_uuid();
 v_s5 uuid:=gen_random_uuid(); v_s6 uuid:=gen_random_uuid(); v_s7 uuid:=gen_random_uuid(); v_s8 uuid:=gen_random_uuid();
 v_m1 uuid:=gen_random_uuid(); v_m2 uuid:=gen_random_uuid(); v_m3 uuid:=gen_random_uuid(); v_m4 uuid:=gen_random_uuid();
 v_m5 uuid:=gen_random_uuid(); v_m6 uuid:=gen_random_uuid(); v_m7 uuid:=gen_random_uuid();
 v_res jsonb; v_err text; v_n integer; v_x numeric; v_y numeric;
BEGIN
 SELECT id INTO v_cta FROM public.cuentas_mp LIMIT 1;
 BEGIN
  PERFORM set_config('app.programa_test','on',true);
  PERFORM set_config('app.sub_internal','on',true);
  INSERT INTO public.alumnos(id,nombre,apellido,email,telefono,grupo,estado) VALUES
   (v_a1,'QA','Multi Deuda','qa-multi-'||v_a1||'@test.local','+5491100000001','Sin grupo','activo'),
   (v_a2,'QA','Otro Titular','qa-multi-'||v_a2||'@test.local','+5491100000002','Sin grupo','activo');
  INSERT INTO public.planes(id,nombre,precio,moneda,activo,frecuencia) VALUES
   (v_pa,'QA Multi A',100000,'ARS',true,'mensual'),(v_pb,'QA Multi B',100000,'ARS',true,'mensual'),
   (v_pc,'QA Multi C',100000,'ARS',true,'mensual'),(v_pu,'QA Multi USD',100,'USD',true,'mensual');
  INSERT INTO public.suscripciones(id,alumno_id,plan_id,estado,metodo_pago,origen_registro,precio_base,precio_final,fecha_inicio,fecha_fin) VALUES
   (v_s1,v_a1,v_pa,'pendiente','pendiente','cargado_admin',60000,60000,'2027-01-01','2027-01-31'),
   (v_s2,v_a1,v_pb,'pendiente','pendiente','cargado_admin',90000,90000,'2027-01-01','2027-01-31'),
   (v_s3,v_a1,v_pa,'finalizada','mercadopago','cargado_admin',74802,74802,'2027-02-01','2027-02-28'),
   (v_s4,v_a1,v_pb,'pendiente','pendiente','cargado_admin',78750,78750,'2027-02-01','2027-02-28'),
   (v_s5,v_a1,v_pc,'cancelada','pendiente','cargado_admin',10000,10000,'2027-01-01','2027-01-31'),
   (v_s6,v_a2,v_pa,'pendiente','pendiente','cargado_admin',10000,10000,'2027-01-01','2027-01-31'),
   (v_s7,v_a1,v_pu,'pendiente','pendiente','cargado_admin',100,100,'2027-01-01','2027-01-31'),
   (v_s8,v_a1,v_pa,'pendiente','pendiente','cargado_admin',60000,60000,'2027-03-01','2027-03-31');
  UPDATE public.suscripciones SET cancelada_at=now(),mp_status='approved',mp_payment_id='QA-LEGACY-'||left(v_m2::text,8) WHERE id=v_s3;
  UPDATE public.suscripciones SET cancelada_at=now() WHERE id=v_s5;

  INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,amount,currency,status,fecha_movimiento,alumno_id,suscripcion_id,direccion,description) VALUES
   (v_m1,v_cta,'QA-MULTI-'||v_m1,150000,'ARS','approved',now(),v_a1,NULL,'ingreso','QA multi'),
   (v_m2,v_cta,'QA-LEGACY-'||v_m2,153552,'ARS','approved',now(),v_a1,v_s3,'ingreso','QA remanente'),
   (v_m3,v_cta,'QA-EXCESO-'||v_m3,50000,'ARS','approved',now(),v_a1,NULL,'ingreso','QA exceso'),
   (v_m4,v_cta,'QA-CANCEL-'||v_m4,10000,'ARS','approved',now(),v_a1,NULL,'ingreso','QA cancelada'),
   (v_m5,v_cta,'QA-MONEDA-'||v_m5,100,'ARS','approved',now(),v_a1,NULL,'ingreso','QA moneda'),
   (v_m6,v_cta,'QA-TITULAR-'||v_m6,10000,'ARS','approved',now(),v_a1,NULL,'ingreso','QA titular'),
   (v_m7,v_cta,'QA-ROLLBACK-'||v_m7,50000,'ARS','approved',now(),v_a1,NULL,'ingreso','QA rollback');

  v_res:=public.imputar_pago_en_deudas('mp_movement',v_m1,jsonb_build_array(
   jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',v_s1,'monto',60000),
   jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',v_s2,'monto',90000)),'qa-dos-deudas');
  SELECT count(*) INTO v_n FROM public.pagos_imputaciones WHERE pago_origen_id=v_m1 AND anulado_at IS NULL;
  v_x:=public.pago_saldo_disponible('mp_movement',v_m1);
  v_out:=v_out||jsonb_build_object('t',1,'n','Un pago cubre dos deudas y agota el remanente','ok',v_n=2 AND v_x=0,'d',format('imputaciones=%s disponible=%s',v_n,v_x));

  v_res:=public.imputar_pago_en_deudas('mp_movement',v_m2,jsonb_build_array(
   jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',v_s4,'monto',78750)),'qa-remanente');
  SELECT COALESCE(sum(haber),0) INTO v_x FROM public.vw_cuenta_corriente_movimientos WHERE fuente_tabla='mp_account_movements' AND fuente_id=v_m2;
  SELECT COALESCE(sum(haber),0) INTO v_y FROM public.vw_cuenta_corriente_movimientos WHERE fuente_tabla='pagos_imputaciones' AND referencia_extra->>'pago_origen_id'=v_m2::text;
  v_out:=v_out||jsonb_build_object('t',2,'n','Remanente vinculado: ledger 74.802 + 78.750 sin duplicar ingreso','ok',v_x=74802 AND v_y=78750 AND public.pago_saldo_disponible('mp_movement',v_m2)=0,'d',format('haber legacy=%s imputado=%s',v_x,v_y));

  v_res:=public.imputar_pago_en_deudas('mp_movement',v_m1,jsonb_build_array(
   jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',v_s1,'monto',60000),
   jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',v_s2,'monto',90000)),'qa-dos-deudas');
  SELECT count(*) INTO v_n FROM public.pagos_imputaciones WHERE pago_origen_id=v_m1 AND anulado_at IS NULL;
  v_out:=v_out||jsonb_build_object('t',3,'n','Doble click: mismas dos imputaciones, sin filas nuevas','ok',v_n=2 AND (v_res->>'total_nuevo')::numeric=0,'d',v_res::text);

  v_err:=NULL;
  BEGIN PERFORM public.imputar_pago_en_deudas('mp_movement',v_m3,jsonb_build_array(jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',v_s8,'monto',60000)),'qa-exceso');
  EXCEPTION WHEN OTHERS THEN v_err:=SQLERRM; END;
  SELECT count(*) INTO v_n FROM public.pagos_imputaciones WHERE pago_origen_id=v_m3 AND anulado_at IS NULL;
  v_out:=v_out||jsonb_build_object('t',4,'n','Exceso rechazado sin escritura parcial','ok',v_err IS NOT NULL AND v_n=0,'d',COALESCE(v_err,'no bloqueó'));

  v_err:=NULL;
  BEGIN PERFORM public.imputar_pago_en_deudas('mp_movement',v_m4,jsonb_build_array(jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',v_s5,'monto',10000)),'qa-cancelada');
  EXCEPTION WHEN OTHERS THEN v_err:=SQLERRM; END;
  v_out:=v_out||jsonb_build_object('t',5,'n','Deuda cancelada rechazada','ok',v_err IS NOT NULL,'d',COALESCE(v_err,'no bloqueó'));

  v_err:=NULL;
  BEGIN PERFORM public.imputar_pago_en_deudas('mp_movement',v_m5,jsonb_build_array(jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',v_s7,'monto',100)),'qa-moneda');
  EXCEPTION WHEN OTHERS THEN v_err:=SQLERRM; END;
  v_out:=v_out||jsonb_build_object('t',6,'n','Moneda distinta rechazada','ok',v_err IS NOT NULL,'d',COALESCE(v_err,'no bloqueó'));

  v_err:=NULL;
  BEGIN PERFORM public.imputar_pago_en_deudas('mp_movement',v_m6,jsonb_build_array(jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',v_s6,'monto',10000)),'qa-titular');
  EXCEPTION WHEN OTHERS THEN v_err:=SQLERRM; END;
  v_out:=v_out||jsonb_build_object('t',7,'n','Titular distinto rechazado','ok',v_err IS NOT NULL,'d',COALESCE(v_err,'no bloqueó'));

  v_err:=NULL;
  BEGIN PERFORM public.imputar_pago_en_deudas('mp_movement',v_m7,jsonb_build_array(
   jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',v_s8,'monto',20000),
   jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',v_s6,'monto',10000)),'qa-rollback');
  EXCEPTION WHEN OTHERS THEN v_err:=SQLERRM; END;
  SELECT count(*) INTO v_n FROM public.pagos_imputaciones WHERE pago_origen_id=v_m7 AND anulado_at IS NULL;
  v_out:=v_out||jsonb_build_object('t',8,'n','Error en la segunda deuda revierte también la primera','ok',v_err IS NOT NULL AND v_n=0,'d',COALESCE(v_err,'no bloqueó'));

  RAISE EXCEPTION 'ROLLBACK_TESTS';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'ROLLBACK_TESTS' THEN v_out:=v_out||jsonb_build_object('t',0,'n','ERROR FATAL durante tests multi-deuda','ok',false,'d',SQLERRM); END IF;
 END;
 RETURN QUERY SELECT (e->>'t')::int,CASE WHEN (e->>'ok')::boolean THEN 'PASS' ELSE 'FAIL' END,e->>'n',e->>'d'
 FROM jsonb_array_elements(v_out) e ORDER BY (e->>'t')::int;
END $$;
REVOKE ALL ON FUNCTION public.run_mp_multi_debt_regression_tests() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_mp_multi_debt_regression_tests() TO service_role;

CREATE OR REPLACE FUNCTION public.run_financial_regression_tests()
RETURNS TABLE(test integer,estado text,nombre text,detalle text)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT test,estado,nombre,detalle FROM public.run_financial_regression_tests_core()
 UNION ALL SELECT 100+test,estado,'[imputaciones] '||nombre,detalle FROM public.run_imputaciones_regression_tests()
 UNION ALL SELECT 200+test,estado,'[multi-deuda] '||nombre,detalle FROM public.run_mp_multi_debt_regression_tests()
 ORDER BY 1;
$$;
