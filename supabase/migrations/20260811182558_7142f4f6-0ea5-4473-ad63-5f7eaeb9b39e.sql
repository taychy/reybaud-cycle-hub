CREATE OR REPLACE FUNCTION public.run_backfill_preview_tests()
RETURNS TABLE(test integer, estado text, nombre text, detalle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_cta uuid;
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); a3 uuid := gen_random_uuid();
  a4 uuid := gen_random_uuid(); a5 uuid := gen_random_uuid(); a6 uuid := gen_random_uuid();
  a7 uuid := gen_random_uuid(); a8 uuid := gen_random_uuid();
  s1 uuid; s2 uuid; s3a uuid; s3b uuid; s4 uuid; s5 uuid; s6 uuid; s7 uuid; s8 uuid;
  m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; m6 uuid; m8a uuid; m8b uuid; m9 uuid; m10 uuid;
  m11 uuid; m12 uuid; m13 uuid;
  v_ev uuid := gen_random_uuid(); v_res uuid; v_ord uuid := gen_random_uuid();
  v_mpid_fam text := 'QA-BF-FAM-' || substr(gen_random_uuid()::text,1,8);
  v_mpid_dup text := 'QA-BF-DUP-' || substr(gen_random_uuid()::text,1,8);
  v_mpid_evt text := 'QA-BF-EVT-' || substr(gen_random_uuid()::text,1,8);
  v_txt text; v_n int; v_x numeric; v_y numeric; v_h1 text; v_h2 text;

  FUNCTION_PLACEHOLDER int;
BEGIN
  SELECT id INTO v_cta FROM public.cuentas_mp LIMIT 1;

  BEGIN
    INSERT INTO public.alumnos (id, nombre, apellido, email, grupo, estado) VALUES
      (a1,'QA','BF1','qa-'||a1||'@test.local','Sin grupo','activo'),
      (a2,'QA','BF2','qa-'||a2||'@test.local','Sin grupo','activo'),
      (a3,'QA','BF3','qa-'||a3||'@test.local','Sin grupo','activo'),
      (a4,'QA','BF4','qa-'||a4||'@test.local','Sin grupo','activo'),
      (a5,'QA','BF5','qa-'||a5||'@test.local','Sin grupo','activo'),
      (a6,'QA','BF6','qa-'||a6||'@test.local','Sin grupo','activo'),
      (a7,'QA','BF7','qa-'||a7||'@test.local','Sin grupo','activo'),
      (a8,'QAIDENT','BF8','qa-'||a8||'@test.local','Sin grupo','activo');

    PERFORM set_config('app.sub_internal','on', true);

    -- helper inline: crear plan+suscripcion pendiente
    INSERT INTO public.planes (id, nombre, precio, moneda, activo, frecuencia)
      SELECT gen_random_uuid(), 'QA BF '||g, 1, 'ARS', true, 'mensual' FROM generate_series(1,1) g;

    -- S1 (vínculo explícito)
    INSERT INTO public.planes (id,nombre,precio,moneda,activo,frecuencia) VALUES (gen_random_uuid(),'QA BF S1',10000,'ARS',true,'mensual');
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro, precio_base, precio_final, fecha_inicio, fecha_fin)
      VALUES (a1,(SELECT id FROM public.planes WHERE nombre='QA BF S1' ORDER BY created_at DESC LIMIT 1),'pendiente','pendiente','cargado_admin',10000,10000,
              date_trunc('month',CURRENT_DATE)::date,(date_trunc('month',CURRENT_DATE)+interval '1 month - 1 day')::date) RETURNING id INTO s1;
    -- S2 (único candidato exacto)
    INSERT INTO public.planes (id,nombre,precio,moneda,activo,frecuencia) VALUES (gen_random_uuid(),'QA BF S2',20000,'ARS',true,'mensual');
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro, precio_base, precio_final, fecha_inicio, fecha_fin)
      VALUES (a2,(SELECT id FROM public.planes WHERE nombre='QA BF S2' ORDER BY created_at DESC LIMIT 1),'pendiente','pendiente','cargado_admin',20000,20000,
              date_trunc('month',CURRENT_DATE)::date,(date_trunc('month',CURRENT_DATE)+interval '1 month - 1 day')::date) RETURNING id INTO s2;
    -- S3a/S3b (dos obligaciones idénticas)
    INSERT INTO public.planes (id,nombre,precio,moneda,activo,frecuencia) VALUES (gen_random_uuid(),'QA BF S3',5000,'ARS',true,'mensual');
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro, precio_base, precio_final, fecha_inicio, fecha_fin)
      VALUES (a3,(SELECT id FROM public.planes WHERE nombre='QA BF S3' ORDER BY created_at DESC LIMIT 1),'pendiente','pendiente','cargado_admin',5000,5000,
              date_trunc('month',CURRENT_DATE)::date,(date_trunc('month',CURRENT_DATE)+interval '1 month - 1 day')::date) RETURNING id INTO s3a;
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro, precio_base, precio_final, fecha_inicio, fecha_fin)
      VALUES (a3,(SELECT id FROM public.planes WHERE nombre='QA BF S3' ORDER BY created_at DESC LIMIT 1),'pendiente','pendiente','cargado_admin',5000,5000,
              (date_trunc('month',CURRENT_DATE)+interval '1 month')::date,(date_trunc('month',CURRENT_DATE)+interval '2 month - 1 day')::date) RETURNING id INTO s3b;
    -- S4 pago parcial
    INSERT INTO public.planes (id,nombre,precio,moneda,activo,frecuencia) VALUES (gen_random_uuid(),'QA BF S4',100000,'ARS',true,'mensual');
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro, precio_base, precio_final, fecha_inicio, fecha_fin)
      VALUES (a4,(SELECT id FROM public.planes WHERE nombre='QA BF S4' ORDER BY created_at DESC LIMIT 1),'pendiente','pendiente','cargado_admin',100000,100000,
              date_trunc('month',CURRENT_DATE)::date,(date_trunc('month',CURRENT_DATE)+interval '1 month - 1 day')::date) RETURNING id INTO s4;
    -- S5 excedente
    INSERT INTO public.planes (id,nombre,precio,moneda,activo,frecuencia) VALUES (gen_random_uuid(),'QA BF S5',80000,'ARS',true,'mensual');
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro, precio_base, precio_final, fecha_inicio, fecha_fin)
      VALUES (a5,(SELECT id FROM public.planes WHERE nombre='QA BF S5' ORDER BY created_at DESC LIMIT 1),'pendiente','pendiente','cargado_admin',80000,80000,
              date_trunc('month',CURRENT_DATE)::date,(date_trunc('month',CURRENT_DATE)+interval '1 month - 1 day')::date) RETURNING id INTO s5;
    -- S6/S7 split familiar (30000 + 20000 = 50000)
    INSERT INTO public.planes (id,nombre,precio,moneda,activo,frecuencia) VALUES (gen_random_uuid(),'QA BF S6',30000,'ARS',true,'mensual');
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro, precio_base, precio_final, fecha_inicio, fecha_fin, mp_payment_id, mp_status, metodo_pago)
      VALUES (a6,(SELECT id FROM public.planes WHERE nombre='QA BF S6' ORDER BY created_at DESC LIMIT 1),'activa','mercadopago','cargado_admin',30000,30000,
              date_trunc('month',CURRENT_DATE)::date,(date_trunc('month',CURRENT_DATE)+interval '1 month - 1 day')::date, v_mpid_fam,'approved','mercadopago') RETURNING id INTO s6;
    INSERT INTO public.planes (id,nombre,precio,moneda,activo,frecuencia) VALUES (gen_random_uuid(),'QA BF S7',20000,'ARS',true,'mensual');
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro, precio_base, precio_final, fecha_inicio, fecha_fin, mp_payment_id, mp_status)
      VALUES (a7,(SELECT id FROM public.planes WHERE nombre='QA BF S7' ORDER BY created_at DESC LIMIT 1),'activa','mercadopago','cargado_admin',20000,20000,
              date_trunc('month',CURRENT_DATE)::date,(date_trunc('month',CURRENT_DATE)+interval '1 month - 1 day')::date, v_mpid_fam,'approved') RETURNING id INTO s7;
    -- S8 varios pagos una obligación
    INSERT INTO public.planes (id,nombre,precio,moneda,activo,frecuencia) VALUES (gen_random_uuid(),'QA BF S8',30000,'ARS',true,'mensual');
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro, precio_base, precio_final, fecha_inicio, fecha_fin)
      VALUES (a1,(SELECT id FROM public.planes WHERE nombre='QA BF S8' ORDER BY created_at DESC LIMIT 1),'pendiente','pendiente','cargado_admin',30000,30000,
              date_trunc('month',CURRENT_DATE)::date,(date_trunc('month',CURRENT_DATE)+interval '1 month - 1 day')::date) RETURNING id INTO s8;
    PERFORM set_config('app.sub_internal','off', true);

    -- movimientos MP
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento, alumno_id, suscripcion_id)
      VALUES (v_cta,'QA-BF-1-'||substr(gen_random_uuid()::text,1,8),'payment','approved',10000,'ARS','ingreso',now(),a1,s1) RETURNING id INTO m1;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento, alumno_id)
      VALUES (v_cta,'QA-BF-2-'||substr(gen_random_uuid()::text,1,8),'payment','approved',20000,'ARS','ingreso',now(),a2) RETURNING id INTO m2;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento, alumno_id)
      VALUES (v_cta,'QA-BF-3-'||substr(gen_random_uuid()::text,1,8),'payment','approved',5000,'ARS','ingreso',now(),a3) RETURNING id INTO m3;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento, alumno_id)
      VALUES (v_cta,'QA-BF-4-'||substr(gen_random_uuid()::text,1,8),'payment','approved',60000,'ARS','ingreso',now(),a4) RETURNING id INTO m4;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento, alumno_id)
      VALUES (v_cta,'QA-BF-5-'||substr(gen_random_uuid()::text,1,8),'payment','approved',100000,'ARS','ingreso',now(),a5) RETURNING id INTO m5;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento, alumno_id)
      VALUES (v_cta,v_mpid_fam,'payment','approved',50000,'ARS','ingreso',now(),a6) RETURNING id INTO m6;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento, alumno_id, suscripcion_id)
      VALUES (v_cta,'QA-BF-8A-'||substr(gen_random_uuid()::text,1,8),'payment','approved',20000,'ARS','ingreso',now(),a1,s8) RETURNING id INTO m8a;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento, alumno_id, suscripcion_id)
      VALUES (v_cta,'QA-BF-8B-'||substr(gen_random_uuid()::text,1,8),'payment','approved',20000,'ARS','ingreso',now(),a1,s8) RETURNING id INTO m8b;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento)
      VALUES (v_cta,'QA-BF-9-'||substr(gen_random_uuid()::text,1,8),'payment','approved',7777,'ARS','ingreso',now()) RETURNING id INTO m9;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento, payer_email)
      VALUES (v_cta,'QA-BF-10-'||substr(gen_random_uuid()::text,1,8),'payment','approved',8888,'ARS','ingreso',now(),'qa-'||a8||'@test.local') RETURNING id INTO m10;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento, alumno_id)
      VALUES (v_cta,'QA-BF-11-'||substr(gen_random_uuid()::text,1,8),'payment','rejected',9999,'ARS','ingreso',now(),a4) RETURNING id INTO m11;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento, alumno_id)
      VALUES (v_cta,v_mpid_dup,'payment','approved',12345,'ARS','ingreso',now(),a4) RETURNING id INTO m12;
    INSERT INTO public.cuenta_ajustes (alumno_id, tipo, concepto, monto, moneda, fecha, referencia_externa)
      VALUES (a4,'credito','QA credito duplicado',12345,'ARS',CURRENT_DATE, v_mpid_dup);

    -- evento con pago MP (no debe duplicarse)
    INSERT INTO public.events (id, title, date) VALUES (v_ev,'QA BF Camp '||left(v_ev::text,8), CURRENT_DATE + 30);
    INSERT INTO public.event_reservations (event_id, alumno_id, amount_total, amount_paid, balance_due, moneda)
      VALUES (v_ev, a5, 300000, 0, 300000, 'ARS') RETURNING id INTO v_res;
    INSERT INTO public.reservation_payments (reservation_id, alumno_id, amount, currency, payment_date, payment_method, status, mp_payment_id)
      VALUES (v_res, a5, 50000, 'ARS', CURRENT_DATE, 'mercadopago', 'validado', v_mpid_evt);
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento, alumno_id)
      VALUES (v_cta, v_mpid_evt,'payment','approved',50000,'ARS','ingreso',now(),a5) RETURNING id INTO m13;

    -- pedido de tienda cancelado pero pagado
    INSERT INTO public.store_orders (id, alumno_id, customer_name, customer_email, total, status, currency, pagado_at, cancelled_at, metodo_pago)
      VALUES (v_ord, a2, 'QA BF2', 'qa-'||a2||'@test.local', 15000, 'cancelado', 'ARS', now(), now(), 'efectivo');

    PERFORM public.refresh_backfill_preview();

    -- 1
    SELECT nivel_confianza INTO v_txt FROM public.mv_backfill_preview WHERE pago_origen_id=m1 AND obligacion_id=s1;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',1,'e',CASE WHEN v_txt='DETERMINISTICO' THEN 'PASS' ELSE 'FAIL' END,
      'n','Match directo por ID -> DETERMINISTICO','d',coalesce(v_txt,'sin fila')));
    -- 2
    SELECT nivel_confianza INTO v_txt FROM public.mv_backfill_preview WHERE pago_origen_id=m2 AND obligacion_id=s2;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',2,'e',CASE WHEN v_txt='ALTA_CONFIANZA' THEN 'PASS' ELSE 'FAIL' END,
      'n','Candidato único exacto sin vínculo -> ALTA_CONFIANZA','d',coalesce(v_txt,'sin fila')));
    -- 3
    SELECT count(*) INTO v_n FROM public.mv_backfill_preview WHERE pago_origen_id=m3 AND nivel_confianza='REQUIERE_REVISION';
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',3,'e',CASE WHEN v_n>=2 THEN 'PASS' ELSE 'FAIL' END,
      'n','Dos obligaciones idénticas -> REQUIERE_REVISION','d','filas='||v_n));
    -- 4
    SELECT count(*) INTO v_n FROM public.mv_backfill_preview WHERE pago_origen_id=m3 AND nivel_confianza='DETERMINISTICO';
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',4,'e',CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL' END,
      'n','Sólo coincidencia de importe nunca es DETERMINISTICO','d','deterministicos='||v_n));
    -- 5
    SELECT motivo_revision INTO v_txt FROM public.mv_backfill_preview WHERE pago_origen_id=m4 AND obligacion_id=s4;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',5,'e',CASE WHEN v_txt ILIKE '%parcial%' THEN 'PASS' ELSE 'FAIL' END,
      'n','Pago parcial identificado como tal','d',coalesce(v_txt,'sin fila')));
    -- 6
    SELECT motivo_revision INTO v_txt FROM public.mv_backfill_preview WHERE pago_origen_id=m5 AND obligacion_id=s5;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',6,'e',CASE WHEN v_txt ILIKE '%excedente%' THEN 'PASS' ELSE 'FAIL' END,
      'n','Pago excedente identificado como tal','d',coalesce(v_txt,'sin fila')));
    -- 7
    SELECT round(sum(monto_propuesto_imputar),2), count(*) INTO v_x, v_n FROM public.mv_backfill_preview WHERE pago_origen_id=m6;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',7,'e',CASE WHEN v_n=2 AND v_x=50000 THEN 'PASS' ELSE 'FAIL' END,
      'n','Split familiar: 1 pago -> 2 obligaciones, suma = pago','d','filas='||v_n||' suma='||coalesce(v_x,0)));
    -- 8
    SELECT round(sum(monto_propuesto_imputar),2) INTO v_x FROM public.mv_backfill_preview WHERE obligacion_id=s8;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',8,'e',CASE WHEN v_x<=30000.01 THEN 'PASS' ELSE 'FAIL' END,
      'n','Varios pagos a una obligación no superan su importe','d','suma='||coalesce(v_x,0)));
    -- 9
    SELECT nivel_confianza INTO v_txt FROM public.mv_backfill_preview WHERE pago_origen_id=m9;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',9,'e',CASE WHEN v_txt='NO_CLASIFICABLE' THEN 'PASS' ELSE 'FAIL' END,
      'n','Pago sin alumno -> NO_CLASIFICABLE','d',coalesce(v_txt,'sin fila')));
    -- 10
    SELECT count(*) INTO v_n FROM public.vw_backfill_identidad_sugerida WHERE pago_origen_id=m10 AND alumno_sugerido_id=a8;
    SELECT nivel_confianza INTO v_txt FROM public.mv_backfill_preview WHERE pago_origen_id=m10;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',10,'e',CASE WHEN v_n=1 AND v_txt='NO_CLASIFICABLE' THEN 'PASS' ELSE 'FAIL' END,
      'n','Identidad sugerida no equivale a imputación','d','sugerencias='||v_n||' nivel='||coalesce(v_txt,'-')));
    -- 11
    SELECT count(*) INTO v_n FROM public.mv_backfill_ingresos WHERE pago_origen_id=m11;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',11,'e',CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL' END,
      'n','Pago rechazado no genera ingreso ni imputación','d','filas='||v_n));
    -- 12
    SELECT count(*) INTO v_n FROM public.mv_backfill_ingresos WHERE mp_payment_id = v_mpid_dup;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',12,'e',CASE WHEN v_n=1 THEN 'PASS' ELSE 'FAIL' END,
      'n','Crédito duplicado del mismo pago MP no se cuenta dos veces','d','ingresos='||v_n));
    -- 13
    SELECT count(*) INTO v_n FROM public.mv_backfill_ingresos WHERE mp_payment_id = v_mpid_evt;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',13,'e',CASE WHEN v_n=1 THEN 'PASS' ELSE 'FAIL' END,
      'n','Evento: pago MP no se cuenta dos veces','d','ingresos='||v_n));
    -- 14
    SELECT count(*) INTO v_n FROM public.mv_backfill_ingresos WHERE pago_origen_tipo='store_order' AND pago_origen_id=v_ord;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',14,'e',CASE WHEN v_n=1 THEN 'PASS' ELSE 'FAIL' END,
      'n','Pedido cancelado con pago real conserva el ingreso','d','ingresos='||v_n));
    -- 15
    SELECT count(*) INTO v_n FROM public.vw_backfill_sobreimputacion s
      WHERE s.entidad_id IN (m1,m2,m3,m4,m5,m6,m8a,m8b,s1,s2,s3a,s3b,s4,s5,s6,s7,s8);
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',15,'e',CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL' END,
      'n','Sin sobreimputación en los casos simulados','d','violaciones='||v_n));
    -- 16
    SELECT saldo_disponible_pagos INTO v_x FROM public.vw_backfill_saldos_comparacion WHERE alumno_id=a2;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',16,'e',CASE WHEN v_x IS NOT NULL AND v_x >= 0 THEN 'PASS' ELSE 'FAIL' END,
      'n','Saldo simulado consistente (disponible no negativo)','d','disponible='||coalesce(v_x,-1)));
    -- 17
    SELECT md5(string_agg(pago_origen_id::text||coalesce(obligacion_id::text,'-')||monto_propuesto_imputar::text||nivel_confianza, '|' ORDER BY pago_origen_id, obligacion_id, nivel_confianza))
      INTO v_h1 FROM public.mv_backfill_preview;
    PERFORM public.refresh_backfill_preview();
    SELECT md5(string_agg(pago_origen_id::text||coalesce(obligacion_id::text,'-')||monto_propuesto_imputar::text||nivel_confianza, '|' ORDER BY pago_origen_id, obligacion_id, nivel_confianza))
      INTO v_h2 FROM public.mv_backfill_preview;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t',17,'e',CASE WHEN v_h1=v_h2 THEN 'PASS' ELSE 'FAIL' END,
      'n','Dos ejecuciones del preview dan el mismo resultado','d',coalesce(left(v_h1,8),'-')||' vs '||coalesce(left(v_h2,8),'-')));

    RAISE EXCEPTION 'QA_ROLLBACK_BACKFILL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'QA_ROLLBACK_BACKFILL' THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object('t',99,'e','FAIL','n','Error inesperado en fixtures','d',SQLERRM));
    END IF;
  END;

  PERFORM public.refresh_backfill_preview();

  RETURN QUERY
  SELECT (x->>'t')::int, x->>'e', x->>'n', x->>'d'
  FROM jsonb_array_elements(v_out) x ORDER BY 1;
END $fn$;

GRANT EXECUTE ON FUNCTION public.run_backfill_preview_tests() TO service_role;