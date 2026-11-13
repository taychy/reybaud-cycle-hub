-- Real view/functions over disposable fixtures. No application data or credentials.
BEGIN;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
CREATE TRIGGER trg_guard_pagos_imputaciones BEFORE INSERT OR UPDATE ON public.pagos_imputaciones
FOR EACH ROW EXECUTE FUNCTION public.guard_pagos_imputaciones();

CREATE OR REPLACE FUNCTION public.run_cc_duplicate_credit_regression()
RETURNS TABLE(test integer,estado text,nombre text,detalle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_out jsonb:='[]'::jsonb;
  v_haber numeric; v_saldo numeric; v_disponible numeric; v_count integer;
  v_res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);

  -- 1. Full imputation followed by a manual paid marker: one ARS 125,000 income.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA total',125000,'ARS');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
      VALUES(s,a,p,125000,'pendiente','pendiente','cargado_admin');
    INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status)
      VALUES(m,gen_random_uuid(),'QA-TOTAL',a,125000,'ARS','ingreso','approved');
    PERFORM public.imputar_pago('mp_movement',m,'suscripcion',s,a,125000,'ARS');
    UPDATE public.suscripciones SET estado='finalizada',metodo_pago='transferencia' WHERE id=s;
    SELECT sum(haber) INTO v_haber FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
    SELECT saldo INTO v_saldo FROM public.get_saldo_alumno(a) WHERE moneda='ARS';
    IF v_haber IS DISTINCT FROM 125000 OR v_saldo IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'haber=% saldo=%; esperado haber=125000 saldo=0',v_haber,v_saldo;
    END IF;
    v_out:=v_out||jsonb_build_object('t',1,'ok',true,'d','haber 125000; saldo 0');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',1,'ok',false,'d',SQLERRM); END;

  -- 2. Partial imputation plus a genuine manual complement must both remain.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA complemento',125000,'ARS');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
      VALUES(s,a,p,125000,'pendiente','pendiente','cargado_admin');
    INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status)
      VALUES(m,gen_random_uuid(),'QA-PARTIAL',a,60000,'ARS','ingreso','approved');
    PERFORM public.imputar_pago('mp_movement',m,'suscripcion',s,a,60000,'ARS');
    UPDATE public.suscripciones SET estado='finalizada',metodo_pago='efectivo' WHERE id=s;
    SELECT sum(haber) INTO v_haber FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
    IF v_haber IS DISTINCT FROM 125000 THEN RAISE EXCEPTION 'haber=%; esperado 125000',v_haber; END IF;
    v_out:=v_out||jsonb_build_object('t',2,'ok',true,'d','60000 imputado + 65000 complementario');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',2,'ok',false,'d',SQLERRM); END;

  -- 3. Mateo-shaped remainder: 74,802 legacy + 78,750 imputed, no extra manual credit.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s1 uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA Mateo',153552,'ARS');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro,mp_status,mp_payment_id)
      VALUES(s1,a,p,74802,'finalizada','mercadopago','cargado_admin','approved','QA-MATEO'),
            (s2,a,p,78750,'pendiente','pendiente','cargado_admin',NULL,NULL);
    INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,suscripcion_id,amount,currency,direccion,status)
      VALUES(m,gen_random_uuid(),'QA-MATEO',a,s1,153552,'ARS','ingreso','approved');
    PERFORM public.imputar_pago('mp_movement',m,'suscripcion',s2,a,78750,'ARS');
    UPDATE public.suscripciones SET estado='finalizada',metodo_pago='transferencia' WHERE id=s2;
    SELECT sum(haber) INTO v_haber FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
    SELECT public.pago_saldo_disponible('mp_movement',m) INTO v_disponible;
    IF v_haber IS DISTINCT FROM 153552 OR v_disponible IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'haber=% disponible=%; esperado 153552/0',v_haber,v_disponible;
    END IF;
    v_out:=v_out||jsonb_build_object('t',3,'ok',true,'d','dos deudas; ingreso total una vez');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',3,'ok',false,'d',SQLERRM); END;

  -- 4. Historical free manual credit + imputation for the same MP: one income.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); cta uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA crédito libre',125000,'ARS');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
      VALUES(s,a,p,125000,'finalizada','transferencia','cargado_admin');
    INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status)
      VALUES(m,cta,'QA-CREDIT-DUP',a,125000,'ARS','ingreso','approved');
    INSERT INTO public.cuenta_ajustes(id,alumno_id,tipo,monto,moneda,referencia_externa,cuenta_mp_id,concepto)
      VALUES(gen_random_uuid(),a,'credito',125000,'ARS','QA-CREDIT-DUP',cta,'QA histórico');
    ALTER TABLE public.pagos_imputaciones DISABLE TRIGGER trg_guard_pagos_imputaciones;
    INSERT INTO public.pagos_imputaciones(pago_origen_tipo,pago_origen_id,obligacion_tipo,obligacion_id,alumno_id,monto,moneda)
      VALUES('mp_movement',m,'suscripcion',s,a,125000,'ARS');
    ALTER TABLE public.pagos_imputaciones ENABLE TRIGGER trg_guard_pagos_imputaciones;
    SELECT sum(haber) INTO v_haber FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
    IF v_haber IS DISTINCT FROM 125000 THEN RAISE EXCEPTION 'haber=%; esperado 125000',v_haber; END IF;
    v_out:=v_out||jsonb_build_object('t',4,'ok',true,'d','crédito libre y MP imputado: un haber');
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.pagos_imputaciones ENABLE TRIGGER trg_guard_pagos_imputaciones;
    v_out:=v_out||jsonb_build_object('t',4,'ok',false,'d',SQLERRM); END;

  -- 5. Historical applied credit + imputation for same MP must not erase the income.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); cta uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA crédito aplicado',125000,'ARS');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
      VALUES(s,a,p,125000,'finalizada','transferencia','cargado_admin');
    INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status)
      VALUES(m,cta,'QA-APPLIED-DUP',a,125000,'ARS','ingreso','approved');
    INSERT INTO public.cuenta_ajustes(id,alumno_id,tipo,monto,moneda,referencia_externa,cuenta_mp_id,concepto,aplicado_a_fuente_tabla,aplicado_a_fuente_id)
      VALUES(gen_random_uuid(),a,'credito',125000,'ARS','QA-APPLIED-DUP',cta,'QA histórico','suscripciones',s);
    ALTER TABLE public.pagos_imputaciones DISABLE TRIGGER trg_guard_pagos_imputaciones;
    INSERT INTO public.pagos_imputaciones(pago_origen_tipo,pago_origen_id,obligacion_tipo,obligacion_id,alumno_id,monto,moneda)
      VALUES('mp_movement',m,'suscripcion',s,a,125000,'ARS');
    ALTER TABLE public.pagos_imputaciones ENABLE TRIGGER trg_guard_pagos_imputaciones;
    SELECT sum(haber) INTO v_haber FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
    IF v_haber IS DISTINCT FROM 125000 THEN RAISE EXCEPTION 'haber=%; esperado conservar 125000',v_haber; END IF;
    v_out:=v_out||jsonb_build_object('t',5,'ok',true,'d','crédito aplicado histórico conservado');
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.pagos_imputaciones ENABLE TRIGGER trg_guard_pagos_imputaciones;
    v_out:=v_out||jsonb_build_object('t',5,'ok',false,'d',SQLERRM); END;

  -- 6. Unallocated approved payment remains available and is not statement income.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA sin imputar',125000,'ARS');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
      VALUES(s,a,p,125000,'pendiente','pendiente','cargado_admin');
    INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status)
      VALUES(m,gen_random_uuid(),'QA-UNALLOCATED',a,125000,'ARS','ingreso','approved');
    SELECT sum(haber) INTO v_haber FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
    SELECT saldo INTO v_saldo FROM public.get_saldo_alumno(a) WHERE moneda='ARS';
    IF coalesce(v_haber,0)<>0 OR v_saldo<>125000 OR public.pago_saldo_disponible('mp_movement',m)<>125000 THEN
      RAISE EXCEPTION 'haber=% saldo=% disponible=%',v_haber,v_saldo,public.pago_saldo_disponible('mp_movement',m);
    END IF;
    v_out:=v_out||jsonb_build_object('t',6,'ok',true,'d','pago no imputado intacto');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',6,'ok',false,'d',SQLERRM); END;

  -- 7. A separate genuine second credit is not deleted or inferred away.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA segundo cobro',125000,'ARS');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
      VALUES(s,a,p,125000,'pendiente','pendiente','cargado_admin');
    INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status)
      VALUES(m,gen_random_uuid(),'QA-REAL-SECOND',a,125000,'ARS','ingreso','approved');
    PERFORM public.imputar_pago('mp_movement',m,'suscripcion',s,a,125000,'ARS');
    UPDATE public.suscripciones SET estado='finalizada',metodo_pago='transferencia' WHERE id=s;
    INSERT INTO public.cuenta_ajustes(id,alumno_id,tipo,monto,moneda,referencia_externa,concepto,comprobante_url)
      VALUES(gen_random_uuid(),a,'credito',25000,'ARS','COMPROBANTE-DISTINTO','Segundo cobro genuino','qa-proof');
    SELECT sum(haber) INTO v_haber FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
    SELECT saldo INTO v_saldo FROM public.get_saldo_alumno(a) WHERE moneda='ARS';
    IF v_haber IS DISTINCT FROM 150000 OR v_saldo IS DISTINCT FROM -25000 THEN
      RAISE EXCEPTION 'haber=% saldo=%; esperado 150000/-25000',v_haber,v_saldo;
    END IF;
    v_out:=v_out||jsonb_build_object('t',7,'ok',true,'d','segundo cobro con comprobante conservado');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',7,'ok',false,'d',SQLERRM); END;

  -- 8. One ordinary overdue manual monthly payment remains one haber.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA vencida',80030,'ARS');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
      VALUES(s,a,p,80030,'vencida','efectivo','cargado_admin');
    SELECT sum(haber) INTO v_haber FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
    SELECT saldo INTO v_saldo FROM public.get_saldo_alumno(a) WHERE moneda='ARS';
    IF v_haber IS DISTINCT FROM 80030 OR v_saldo IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'haber=% saldo=%',v_haber,v_saldo; END IF;
    v_out:=v_out||jsonb_build_object('t',8,'ok',true,'d','mensualidad manual única intacta');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',8,'ok',false,'d',SQLERRM); END;

  -- 9. Ordinary applied credit without imputation keeps its existing representation.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA aplicado normal',80030,'ARS');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
      VALUES(s,a,p,80030,'finalizada','efectivo','cargado_admin');
    INSERT INTO public.cuenta_ajustes(id,alumno_id,tipo,monto,moneda,concepto,aplicado_a_fuente_tabla,aplicado_a_fuente_id)
      VALUES(gen_random_uuid(),a,'credito',80030,'ARS','QA normal','suscripciones',s);
    SELECT sum(haber) INTO v_haber FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
    IF v_haber IS DISTINCT FROM 80030 THEN RAISE EXCEPTION 'haber=%; esperado 80030',v_haber; END IF;
    v_out:=v_out||jsonb_build_object('t',9,'ok',true,'d','crédito aplicado normal intacto');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',9,'ok',false,'d',SQLERRM); END;

  -- 10. Reservation in EUR; rejected and voided payments do not count.
  DECLARE a uuid:=gen_random_uuid(); r uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.event_reservations(id,alumno_id,amount_total,currency_snapshot) VALUES(r,a,2478.61,'EUR');
    INSERT INTO public.reservation_payments(id,alumno_id,reservation_id,amount,currency,event_currency,status) VALUES
      (gen_random_uuid(),a,r,500,'EUR','EUR','validado'),
      (gen_random_uuid(),a,r,500,'EUR','EUR','rechazado'),
      (gen_random_uuid(),a,r,500,'EUR','EUR','validado');
    UPDATE public.reservation_payments SET anulado_at=now() WHERE reservation_id=r AND status='validado' AND anulado_at IS NULL
      AND id<>(SELECT id FROM public.reservation_payments WHERE reservation_id=r AND status='validado' ORDER BY id LIMIT 1);
    SELECT saldo INTO v_saldo FROM public.get_saldo_alumno(a) WHERE moneda='EUR';
    IF v_saldo IS DISTINCT FROM 1978.61 THEN RAISE EXCEPTION 'saldo EUR=%; esperado 1978.61',v_saldo; END IF;
    v_out:=v_out||jsonb_build_object('t',10,'ok',true,'d','reserva EUR, rechazo y anulación intactos');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',10,'ok',false,'d',SQLERRM); END;

  -- 11. Store payment and refund retain their existing debit/credit treatment.
  DECLARE a uuid:=gen_random_uuid(); o uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.store_orders(id,alumno_id,total,currency,status,pagado_at) VALUES(o,a,100,'USD','pagada',now());
    INSERT INTO public.devoluciones(id,alumno_id,store_order_id,monto,moneda,metodo) VALUES(gen_random_uuid(),a,o,25,'USD','transferencia');
    SELECT saldo INTO v_saldo FROM public.get_saldo_alumno(a) WHERE moneda='USD';
    IF v_saldo IS DISTINCT FROM 25 THEN RAISE EXCEPTION 'saldo USD=%; esperado 25',v_saldo; END IF;
    v_out:=v_out||jsonb_build_object('t',11,'ok',true,'d','tienda y devolución intactas');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',11,'ok',false,'d',SQLERRM); END;

  -- 12. Cancelled subscriptions still produce neither charge nor haber.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA cancelada',65000,'ARS');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro,cancelada_at)
      VALUES(s,a,p,65000,'cancelada','efectivo','cargado_admin',now());
    SELECT count(*) INTO v_count FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
    IF v_count<>0 THEN RAISE EXCEPTION 'movimientos=%; esperado 0',v_count; END IF;
    v_out:=v_out||jsonb_build_object('t',12,'ok',true,'d','cancelada sin cargo ni haber');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',12,'ok',false,'d',SQLERRM); END;

  -- 13. Genuine free credit remains available as credit, unrelated to imputations.
  DECLARE a uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.cuenta_ajustes(id,alumno_id,tipo,monto,moneda,concepto,referencia_externa)
      VALUES(gen_random_uuid(),a,'credito',50000,'ARS','Crédito genuino','COMPROBANTE-PROPIO');
    SELECT saldo INTO v_saldo FROM public.get_saldo_alumno(a) WHERE moneda='ARS';
    IF v_saldo IS DISTINCT FROM -50000 THEN RAISE EXCEPTION 'saldo=%; esperado -50000',v_saldo; END IF;
    v_out:=v_out||jsonb_build_object('t',13,'ok',true,'d','crédito verdadero intacto');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',13,'ok',false,'d',SQLERRM); END;

  -- 14. Real multi-debt RPC: two destinations and retry, one total haber.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s1 uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA split',150000,'ARS');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro) VALUES
      (s1,a,p,60000,'pendiente','pendiente','cargado_admin'),(s2,a,p,90000,'pendiente','pendiente','cargado_admin');
    INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status)
      VALUES(m,gen_random_uuid(),'QA-SPLIT',a,150000,'ARS','ingreso','approved');
    v_res:=public.imputar_pago_en_deudas('mp_movement',m,jsonb_build_array(
      jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',s1,'monto',60000),
      jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',s2,'monto',90000)),'qa-split');
    v_res:=public.imputar_pago_en_deudas('mp_movement',m,jsonb_build_array(
      jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',s1,'monto',60000),
      jsonb_build_object('obligacion_tipo','suscripcion','obligacion_id',s2,'monto',90000)),'qa-split');
    SELECT sum(haber) INTO v_haber FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
    SELECT count(*) INTO v_count FROM public.pagos_imputaciones WHERE pago_origen_id=m AND anulado_at IS NULL;
    IF v_haber IS DISTINCT FROM 150000 OR v_count<>2 OR public.pago_saldo_disponible('mp_movement',m)<>0 THEN
      RAISE EXCEPTION 'haber=% filas=% disponible=%',v_haber,v_count,public.pago_saldo_disponible('mp_movement',m);
    END IF;
    v_out:=v_out||jsonb_build_object('t',14,'ok',true,'d','dos deudas; retry idempotente; haber único');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',14,'ok',false,'d',SQLERRM); END;

  -- 15. Daniel-shaped independent operations: the complement must survive on both debts.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s1 uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid();
    m1 uuid:=gen_random_uuid(); m2 uuid:=gen_random_uuid(); cta uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA operaciones independientes',83500,'ARS');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
      VALUES(s1,a,p,83500,'pendiente','pendiente','cargado_admin'),
            (s2,a,p,87238,'finalizada','mercadopago','cargado_admin');
    INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,suscripcion_id,amount,currency,direccion,status) VALUES
      (m1,cta,'QA-DANIEL-PRINCIPAL',a,NULL,76472,'ARS','ingreso','approved'),
      (m2,cta,'QA-DANIEL-INDEPENDIENTE',a,s2,87238,'ARS','ingreso','approved');
    PERFORM public.imputar_pago('mp_movement',m1,'suscripcion',s1,a,76472,'ARS');
    UPDATE public.suscripciones SET estado='finalizada',metodo_pago='transferencia' WHERE id=s1;
    ALTER TABLE public.cuenta_ajustes DISABLE TRIGGER trg_guard_credit_mp_budget;
    INSERT INTO public.cuenta_ajustes(id,alumno_id,tipo,monto,moneda,referencia_externa,cuenta_mp_id,concepto,aplicado_a_fuente_tabla,aplicado_a_fuente_id)
      VALUES(gen_random_uuid(),a,'credito',7028,'ARS','QA-DANIEL-INDEPENDIENTE',cta,'Complemento independiente','suscripciones',s1);
    ALTER TABLE public.cuenta_ajustes ENABLE TRIGGER trg_guard_credit_mp_budget;
    SELECT sum(haber) INTO v_haber FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
    SELECT saldo INTO v_saldo FROM public.get_saldo_alumno(a) WHERE moneda='ARS';
    IF v_haber IS DISTINCT FROM 170738 OR v_saldo IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'haber=% saldo=%; esperado 170738/0',v_haber,v_saldo;
    END IF;
    v_out:=v_out||jsonb_build_object('t',15,'ok',true,'d','76472 + 7028 + 87238; operaciones separadas conservadas');
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.cuenta_ajustes ENABLE TRIGGER trg_guard_credit_mp_budget;
    v_out:=v_out||jsonb_build_object('t',15,'ok',false,'d',SQLERRM); END;

  -- 16. Applied credit without independent evidence: preserve one income, flag for human review.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA revisión manual',83500,'ARS');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
      VALUES(s,a,p,83500,'pendiente','pendiente','cargado_admin');
    INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status)
      VALUES(m,gen_random_uuid(),'QA-REVIEW-NO-REF',a,83500,'ARS','ingreso','approved');
    PERFORM public.imputar_pago('mp_movement',m,'suscripcion',s,a,83500,'ARS');
    UPDATE public.suscripciones SET estado='finalizada',metodo_pago='efectivo' WHERE id=s;
    INSERT INTO public.cuenta_ajustes(id,alumno_id,tipo,monto,moneda,concepto,aplicado_a_fuente_tabla,aplicado_a_fuente_id)
      VALUES(gen_random_uuid(),a,'credito',83500,'ARS','Sin referencia independiente: revisar','suscripciones',s);
    SELECT sum(haber) INTO v_haber FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
    IF v_haber IS DISTINCT FROM 83500 THEN RAISE EXCEPTION 'haber=%; esperado un ingreso 83500',v_haber; END IF;
    v_out:=v_out||jsonb_build_object('t',16,'ok',true,'d','un ingreso; marca sin respaldo queda para revisión humana');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',16,'ok',false,'d',SQLERRM); END;

  -- 17. Subscription in EUR: same deduplication rule, without cross-currency effects.
  DECLARE a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
  BEGIN
    INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA suscripción EUR',500,'EUR');
    INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
      VALUES(s,a,p,500,'pendiente','pendiente','cargado_admin');
    INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status)
      VALUES(m,gen_random_uuid(),'QA-EUR-SUB',a,500,'EUR','ingreso','approved');
    PERFORM public.imputar_pago('mp_movement',m,'suscripcion',s,a,500,'EUR');
    UPDATE public.suscripciones SET estado='finalizada',metodo_pago='transferencia' WHERE id=s;
    SELECT sum(haber) INTO v_haber FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a AND moneda='EUR';
    SELECT saldo INTO v_saldo FROM public.get_saldo_alumno(a) WHERE moneda='EUR';
    IF v_haber IS DISTINCT FROM 500 OR v_saldo IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'haber EUR=% saldo=%; esperado 500/0',v_haber,v_saldo;
    END IF;
    v_out:=v_out||jsonb_build_object('t',17,'ok',true,'d','EUR 500 una sola vez; saldo 0');
  EXCEPTION WHEN OTHERS THEN v_out:=v_out||jsonb_build_object('t',17,'ok',false,'d',SQLERRM); END;

  RAISE EXCEPTION 'ROLLBACK_TESTS';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'ROLLBACK_TESTS' THEN v_out:=v_out||jsonb_build_object('t',0,'ok',false,'d','ERROR FATAL: '||SQLERRM); END IF;
  RETURN QUERY SELECT (e->>'t')::int,CASE WHEN (e->>'ok')::boolean THEN 'PASS' ELSE 'FAIL' END,
    CASE (e->>'t')::int
      WHEN 1 THEN 'Imputación total + marca manual'
      WHEN 2 THEN 'Parcial + complemento genuino'
      WHEN 3 THEN 'Remanente Mateo en dos deudas'
      WHEN 4 THEN 'Crédito libre con mismo MP'
      WHEN 5 THEN 'Crédito aplicado histórico con mismo MP'
      WHEN 6 THEN 'Pago no imputado'
      WHEN 7 THEN 'Segundo cobro genuino separado'
      WHEN 8 THEN 'Mensualidad vencida manual única'
      WHEN 9 THEN 'Crédito aplicado normal'
      WHEN 10 THEN 'Reserva EUR/rechazo/anulación'
      WHEN 11 THEN 'Tienda y devolución USD'
      WHEN 12 THEN 'Suscripción cancelada'
      WHEN 13 THEN 'Crédito verdadero'
      WHEN 14 THEN 'RPC multi-deuda e idempotencia'
      WHEN 15 THEN 'Dos operaciones independientes tipo Daniel'
      WHEN 16 THEN 'Marca sin respaldo: revisión manual'
      WHEN 17 THEN 'Suscripción EUR sin efecto cruzado'
      ELSE 'Infraestructura' END,e->>'d'
  FROM jsonb_array_elements(v_out) e ORDER BY (e->>'t')::int;
END $$;

CREATE TEMP TABLE cc_duplicate_results ON COMMIT DROP AS
SELECT * FROM public.run_cc_duplicate_credit_regression();
SELECT * FROM cc_duplicate_results;
SELECT count(*) FILTER(WHERE estado='PASS') AS pass,
  count(*) FILTER(WHERE estado='FAIL') AS fail,count(*) AS total
FROM cc_duplicate_results;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM cc_duplicate_results WHERE estado='FAIL') THEN
    RAISE EXCEPTION 'CC_DUPLICATE_REGRESSIONS_FAILED';
  END IF;
END $$;
ROLLBACK;
