-- Run only against a disposable empty PostgreSQL database; never production.
-- Fixture mínimo con copia literal de sync_turnera_cuenta_corriente y de las funciones de saldo
-- (pago_monto_legacy reducida a sus ramas de crédito representado y turnera).
\set ON_ERROR_STOP on
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql AS $$ SELECT 'qa@example.invalid' $$;
CREATE TYPE public.app_role AS ENUM ('admin','alumno','coach','deposito');
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
CREATE TABLE public.admin_profiles(user_id uuid, role text);
CREATE FUNCTION public.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) $$;
CREATE FUNCTION public.is_super_admin(u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.admin_profiles WHERE user_id=u AND role='super_admin') $$;
CREATE TABLE public.audit_log(user_id uuid,user_email text,user_role text,action text,entity_type text,entity_id text,details jsonb);
CREATE TABLE public.servicios_turnera(id uuid PRIMARY KEY, nombre text);
CREATE TABLE public.reservas_turnera(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), servicio_id uuid, alumno_id uuid, fecha date, hora_inicio time,
  estado_operativo text DEFAULT 'confirmada', estado_economico text DEFAULT 'pendiente', pago_estado text DEFAULT 'pendiente',
  precio_snapshot numeric, moneda_snapshot text DEFAULT 'ARS', pago_monto numeric, metodo_pago text,
  pago_mp_payment_id text, hold_expira_at timestamptz, verificado_por uuid, verificado_at timestamptz);
CREATE TABLE public.cuenta_ajustes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), alumno_id uuid, tipo text, concepto text, monto numeric, moneda text,
  fecha date, notas text, medio_pago text, referencia_externa text, cuenta_mp_id uuid,
  aplicado_a_fuente_tabla text, aplicado_a_fuente_id uuid);
CREATE TABLE public.mp_account_movements(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cuenta_mp_id uuid, mp_payment_id text, tipo text DEFAULT 'payment',
  status text DEFAULT 'approved', direccion text DEFAULT 'ingreso', amount numeric, currency text DEFAULT 'ARS',
  external_reference text, alumno_id uuid, suscripcion_id uuid, reservation_payment_id uuid, gasto_id uuid, liquidacion_id uuid,
  note text);
CREATE TABLE public.pagos_imputaciones(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pago_origen_tipo text, pago_origen_id uuid,
  obligacion_tipo text, obligacion_id uuid, monto numeric, anulado_at timestamptz);

CREATE FUNCTION public.pago_monto_bruto(_tipo text,_id uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT CASE _tipo WHEN 'mp_movement' THEN (SELECT amount FROM public.mp_account_movements WHERE id=_id) END $$;
CREATE FUNCTION public.pago_monto_imputado(_tipo text,_id uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT COALESCE(SUM(monto),0) FROM public.pagos_imputaciones WHERE pago_origen_tipo=_tipo AND pago_origen_id=_id AND anulado_at IS NULL $$;
CREATE FUNCTION public.pago_credito_representado(_id uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT COALESCE(sum(ca.monto),0) FROM public.mp_account_movements mp JOIN public.cuenta_ajustes ca ON ca.referencia_externa=mp.mp_payment_id AND ca.cuenta_mp_id=mp.cuenta_mp_id AND upper(ca.moneda)=upper(mp.currency) WHERE mp.id=_id AND ca.tipo='credito' $$;
CREATE FUNCTION public.pago_monto_legacy(_tipo text,_id uuid) RETURNS numeric LANGUAGE sql AS $$
 SELECT LEAST(COALESCE(public.pago_monto_bruto(_tipo,_id),0), GREATEST(public.pago_credito_representado(_id),
   COALESCE((SELECT LEAST(mp.amount,SUM(LEAST(COALESCE(t.pago_monto,0),COALESCE(t.precio_snapshot,0))))
     FROM public.mp_account_movements mp JOIN public.reservas_turnera t ON t.pago_mp_payment_id=mp.mp_payment_id
       AND t.alumno_id=mp.alumno_id AND UPPER(t.moneda_snapshot)=UPPER(mp.currency)
     WHERE mp.id=_id AND mp.mp_payment_id IS NOT NULL AND t.estado_economico='pagado'
       AND COALESCE(t.estado_operativo,'') NOT IN ('cancelada','cancelado')
       AND (t.pago_estado IN ('aprobado','approved') OR t.pago_monto>0) GROUP BY mp.amount),0))) $$;
CREATE FUNCTION public.pago_saldo_disponible(_tipo text,_id uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT GREATEST(0,COALESCE(public.pago_monto_bruto(_tipo,_id),0)-public.pago_monto_legacy(_tipo,_id)-public.pago_monto_imputado(_tipo,_id)) $$;

-- Copia literal del trigger productivo.
CREATE FUNCTION public.sync_turnera_cuenta_corriente() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_concepto text; v_precio numeric; v_pago numeric; v_op text; v_is_cancelled boolean; v_is_paid boolean;
BEGIN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  v_is_cancelled := COALESCE(NEW.estado_operativo,'') LIKE 'cancelada%';
  IF NEW.alumno_id IS NULL THEN RETURN NEW; END IF;
  v_precio := COALESCE(NEW.precio_snapshot,0); v_pago := COALESCE(NEW.pago_monto,0);
  SELECT nombre INTO v_concepto FROM public.servicios_turnera WHERE id=NEW.servicio_id;
  v_concepto := 'Turnera: '||COALESCE(v_concepto,'servicio')||' — '||to_char(NEW.fecha,'DD/MM/YYYY')||' '||to_char(NEW.hora_inicio,'HH24:MI');
  v_op := 'reserva_turnera:'||NEW.id::text;
  IF v_is_cancelled THEN
    DELETE FROM public.cuenta_ajustes WHERE aplicado_a_fuente_tabla='reservas_turnera' AND aplicado_a_fuente_id=NEW.id
      AND (tipo<>'credito' OR aplicado_a_fuente_id IS NULL OR referencia_externa=v_op);
    RETURN NEW;
  END IF;
  IF v_precio>0 THEN
    IF NOT EXISTS(SELECT 1 FROM public.cuenta_ajustes WHERE aplicado_a_fuente_tabla='reservas_turnera' AND aplicado_a_fuente_id=NEW.id AND tipo='cargo') THEN
      INSERT INTO public.cuenta_ajustes(alumno_id,tipo,concepto,monto,moneda,fecha,notas,referencia_externa,aplicado_a_fuente_tabla,aplicado_a_fuente_id)
      VALUES(NEW.alumno_id,'cargo',v_concepto,v_precio,COALESCE(NEW.moneda_snapshot,'ARS'),NEW.fecha,'Alta automática desde reserva de turnera',v_op,'reservas_turnera',NEW.id);
    ELSE
      UPDATE public.cuenta_ajustes SET monto=v_precio,concepto=v_concepto,moneda=COALESCE(NEW.moneda_snapshot,'ARS'),fecha=NEW.fecha
      WHERE aplicado_a_fuente_tabla='reservas_turnera' AND aplicado_a_fuente_id=NEW.id AND tipo='cargo';
    END IF;
  END IF;
  v_is_paid := COALESCE(NEW.estado_economico,'')='pagado' OR COALESCE(NEW.pago_estado,'')='aprobado';
  IF v_is_paid AND v_pago>0 THEN
    IF NOT EXISTS(SELECT 1 FROM public.cuenta_ajustes WHERE aplicado_a_fuente_tabla='reservas_turnera' AND aplicado_a_fuente_id=NEW.id AND tipo='credito') THEN
      INSERT INTO public.cuenta_ajustes(alumno_id,tipo,concepto,monto,moneda,fecha,notas,medio_pago,referencia_externa,aplicado_a_fuente_tabla,aplicado_a_fuente_id)
      VALUES(NEW.alumno_id,'credito','Pago '||v_concepto,v_pago,COALESCE(NEW.moneda_snapshot,'ARS'),NEW.fecha,'Pago registrado desde turnera',COALESCE(NEW.metodo_pago,'otro'),v_op,'reservas_turnera',NEW.id);
    ELSE
      UPDATE public.cuenta_ajustes SET monto=v_pago,medio_pago=COALESCE(NEW.metodo_pago,medio_pago),fecha=NEW.fecha
      WHERE aplicado_a_fuente_tabla='reservas_turnera' AND aplicado_a_fuente_id=NEW.id AND tipo='credito';
    END IF;
  ELSIF NOT v_is_paid THEN
    DELETE FROM public.cuenta_ajustes WHERE aplicado_a_fuente_tabla='reservas_turnera' AND aplicado_a_fuente_id=NEW.id AND tipo='credito' AND referencia_externa=v_op;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sync AFTER INSERT OR UPDATE ON public.reservas_turnera FOR EACH ROW EXECUTE FUNCTION public.sync_turnera_cuenta_corriente();

\i sql/pending/0117_turnera_reservation_payments.sql
\i sql/pending/0117_turnera_reservation_payments.sql

CREATE FUNCTION pg_temp.expect_fail(_sql text, _like text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE _sql; EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%'||_like||'%' THEN RAISE EXCEPTION 'FAIL esperado "%", obtenido "%"', _like, SQLERRM; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL debía fallar (%): %', _like, _sql;
END $$;

DO $$
DECLARE
  adm uuid := gen_random_uuid(); sup uuid := gen_random_uuid(); a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid();
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid(); rc uuid := gen_random_uuid();
  m1 uuid; m2 uuid; mp_pend uuid; mp_rej uuid; mp_out uuid; mp_ref uuid; mp_sub uuid; mp_used uuid; mp_cred uuid; mp_big uuid;
  res jsonb; n int;
BEGIN
  INSERT INTO public.user_roles VALUES (adm,'admin');
  INSERT INTO public.admin_profiles VALUES (sup,'super_admin');
  INSERT INTO public.servicios_turnera VALUES (gen_random_uuid(),'Clase Personalizada');
  -- Mismo alumno, mismo mes, tres clases; una cancelada.
  INSERT INTO public.reservas_turnera(id,alumno_id,fecha,hora_inicio,precio_snapshot) VALUES
    (r1,a1,'2026-11-05','10:00',30000),(r2,a1,'2026-11-19','10:00',30000),(r3,a1,'2026-11-26','10:00',30000);
  INSERT INTO public.reservas_turnera(id,alumno_id,fecha,hora_inicio,precio_snapshot,estado_operativo) VALUES (rc,a1,'2026-11-12','10:00',30000,'cancelada');

  INSERT INTO public.mp_account_movements(mp_payment_id,amount,external_reference) VALUES ('MP1',30000,'turnera:'||r1) RETURNING id INTO m1;
  INSERT INTO public.mp_account_movements(mp_payment_id,amount,external_reference) VALUES ('MP2',30000,'turnera:'||r2) RETURNING id INTO m2;
  INSERT INTO public.mp_account_movements(mp_payment_id,amount,external_reference,status) VALUES ('MPP',30000,'turnera:'||r3,'pending') RETURNING id INTO mp_pend;
  INSERT INTO public.mp_account_movements(mp_payment_id,amount,external_reference,status) VALUES ('MPR',30000,'turnera:'||r3,'rejected') RETURNING id INTO mp_rej;
  INSERT INTO public.mp_account_movements(mp_payment_id,amount,external_reference,direccion) VALUES ('MPO',30000,'turnera:'||r3,'egreso') RETURNING id INTO mp_out;
  INSERT INTO public.mp_account_movements(mp_payment_id,amount,external_reference,tipo) VALUES ('MPF',30000,'turnera:'||r3,'refund') RETURNING id INTO mp_ref;
  INSERT INTO public.mp_account_movements(mp_payment_id,amount,external_reference) VALUES ('MPX',30000,NULL) RETURNING id INTO mp_sub;
  INSERT INTO public.mp_account_movements(mp_payment_id,amount,external_reference) VALUES ('MPU',30000,'turnera:'||r3) RETURNING id INTO mp_used;
  INSERT INTO public.pagos_imputaciones(pago_origen_tipo,pago_origen_id,obligacion_tipo,obligacion_id,monto) VALUES ('mp_movement',mp_used,'suscripcion',gen_random_uuid(),30000);
  INSERT INTO public.mp_account_movements(mp_payment_id,amount,external_reference,cuenta_mp_id) VALUES ('MPC',30000,'turnera:'||r3,'00000000-0000-0000-0000-0000000000aa') RETURNING id INTO mp_cred;
  INSERT INTO public.cuenta_ajustes(alumno_id,tipo,monto,moneda,referencia_externa,cuenta_mp_id) VALUES (a1,'credito',30000,'ARS','MPC','00000000-0000-0000-0000-0000000000aa');

  -- Permisos: sin sesión y alumno común rechazados.
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''efectivo'')', r1), 'Solo administración');
  PERFORM set_config('test.uid', a1::text, true);
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''efectivo'')', r1), 'Solo administración');
  PERFORM pg_temp.expect_fail(format('SELECT public.get_alumno_turnera_debts(%L)', a1), 'Solo administración');
  PERFORM set_config('test.uid', adm::text, true);
  SELECT count(*) INTO n FROM public.get_alumno_turnera_debts(a1);
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL deudas (sin cancelada) = %', n; END IF;

  -- Método/movimiento coherentes.
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''mercadopago'')', r1), 'elegí la operación');
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''efectivo'',%L)', r1, m1), 'manual no puede');
  -- MP inválidos sobre r3: nada se escribe.
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''mercadopago'',%L)', r3, mp_pend), 'no está aprobado');
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''mercadopago'',%L)', r3, mp_rej), 'no está aprobado');
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''mercadopago'',%L)', r3, mp_out), 'no es un ingreso');
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''mercadopago'',%L)', r3, mp_ref), 'no es un cobro');
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''mercadopago'',%L)', r3, mp_sub), 'no fue emitido');
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''mercadopago'',%L)', r3, m1), 'no fue emitido');
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''mercadopago'',%L)', r3, mp_used), 'imputaciones');
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''mercadopago'',%L)', r3, mp_cred), 'crédito manual');
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''efectivo'',NULL,%L)', r3, a2), 'otro alumno');
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''USD'',''efectivo'')', r3), 'Moneda');
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,25000,''ARS'',''efectivo'')', r3), 'importe');
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''efectivo'')', rc), 'cancelada');
  IF (SELECT pago_estado FROM public.reservas_turnera WHERE id=r3) <> 'pendiente' THEN RAISE EXCEPTION 'FAIL r3 mutó'; END IF;
  IF EXISTS (SELECT 1 FROM public.cuenta_ajustes WHERE aplicado_a_fuente_id IN (r3,rc) AND tipo='credito') THEN RAISE EXCEPTION 'FAIL haber inválido'; END IF;

  -- Dos clases del mismo mes con dos operaciones reales separadas.
  res := public.admin_register_turnera_payment(r1,30000,'ARS','mercadopago',m1,a1);
  IF (res->>'duplicate')::boolean THEN RAISE EXCEPTION 'FAIL r1 duplicate'; END IF;
  -- Doble clic / reintento con la misma operación: idempotente, sin segundo haber.
  res := public.admin_register_turnera_payment(r1,30000,'ARS','mercadopago',m1,a1);
  IF NOT (res->>'duplicate')::boolean THEN RAISE EXCEPTION 'FAIL idempotencia'; END IF;
  -- La misma operación no sirve para otra reserva.
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''mercadopago'',%L)', r2, m1), 'no fue emitido');
  PERFORM set_config('test.uid', sup::text, true);  -- superadmin autorizado
  res := public.admin_register_turnera_payment(r2,30000,'ARS','mercadopago',m2,a1);
  -- Pago manual: segundo intento rechazado (doble clic) sin segundo haber.
  res := public.admin_register_turnera_payment(r3,30000,'ARS','efectivo',NULL,a1);
  PERFORM pg_temp.expect_fail(format('SELECT public.admin_register_turnera_payment(%L,30000,''ARS'',''efectivo'')', r3), 'ya figura pagada');
  FOR n IN SELECT count(*) FROM public.cuenta_ajustes WHERE aplicado_a_fuente_tabla='reservas_turnera' AND tipo='credito' GROUP BY aplicado_a_fuente_id LOOP
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL más de un haber por reserva'; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM public.cuenta_ajustes WHERE aplicado_a_fuente_tabla='reservas_turnera' AND tipo='credito';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL haberes = %', n; END IF;
  IF public.pago_saldo_disponible('mp_movement',m1) <> 0 THEN RAISE EXCEPTION 'FAIL m1 sigue disponible'; END IF;
  IF EXISTS (SELECT 1 FROM public.pagos_imputaciones WHERE obligacion_id IN (r1,r2,r3)) THEN RAISE EXCEPTION 'FAIL usó imputaciones'; END IF;

  -- Cobro mayor al precio: se reconoce solo el precio y el remanente sigue disponible.
  r1 := gen_random_uuid();
  INSERT INTO public.reservas_turnera(id,alumno_id,fecha,hora_inicio,precio_snapshot) VALUES (r1,a2,'2026-11-20','09:00',20000);
  INSERT INTO public.mp_account_movements(mp_payment_id,amount,external_reference,alumno_id) VALUES ('MPB',25000,'turnera:'||r1,a2) RETURNING id INTO mp_big;
  res := public.admin_register_turnera_payment(r1,20000,'ARS','mercadopago',mp_big,a2);
  IF public.pago_saldo_disponible('mp_movement',mp_big) <> 5000 THEN RAISE EXCEPTION 'FAIL remanente = %', public.pago_saldo_disponible('mp_movement',mp_big); END IF;

  -- Guard turnera→mensualidad: INSERT, UPDATE de suscripción y de external_reference.
  PERFORM pg_temp.expect_fail(format('UPDATE public.mp_account_movements SET suscripcion_id=gen_random_uuid() WHERE id=%L', m2), 'mensualidad');
  UPDATE public.mp_account_movements SET external_reference=NULL, suscripcion_id=gen_random_uuid() WHERE id=mp_sub;
  PERFORM pg_temp.expect_fail(format('UPDATE public.mp_account_movements SET external_reference=''turnera:''||%L WHERE id=%L', r3, mp_sub), 'mensualidad');
  -- Vínculo histórico (simulado sin trigger) puede actualizar otras columnas.
  ALTER TABLE public.mp_account_movements DISABLE TRIGGER trg_guard_turnera_mp_not_subscription;
  UPDATE public.mp_account_movements SET suscripcion_id=gen_random_uuid() WHERE id=mp_pend;
  ALTER TABLE public.mp_account_movements ENABLE TRIGGER trg_guard_turnera_mp_not_subscription;
  UPDATE public.mp_account_movements SET note='revisión manual' WHERE id=mp_pend;

  -- Guard de imputaciones sobre cargo turnera con cualquier alias.
  SELECT id INTO m1 FROM public.cuenta_ajustes WHERE aplicado_a_fuente_id=r2 AND tipo='cargo';
  PERFORM pg_temp.expect_fail(format('INSERT INTO public.pagos_imputaciones(pago_origen_tipo,pago_origen_id,obligacion_tipo,obligacion_id,monto) VALUES (''mp_movement'',%L,''otro'',%L,1)', mp_big, m1), 'turnera');
  PERFORM pg_temp.expect_fail(format('INSERT INTO public.pagos_imputaciones(pago_origen_tipo,pago_origen_id,obligacion_tipo,obligacion_id,monto) VALUES (''mp_movement'',%L,''cargo'',%L,1)', mp_big, m1), 'turnera');
  PERFORM pg_temp.expect_fail(format('INSERT INTO public.pagos_imputaciones(pago_origen_tipo,pago_origen_id,obligacion_tipo,obligacion_id,monto) VALUES (''mp_movement'',%L,''turnera'',%L,1)', mp_big, r2), 'turnera');
  -- Anular una imputación histórica sigue permitido.
  UPDATE public.pagos_imputaciones SET anulado_at=now() WHERE pago_origen_id=mp_used;

  -- Cancelación posterior: el trigger productivo retira cargo y haber de esa reserva.
  UPDATE public.reservas_turnera SET estado_operativo='cancelada' WHERE id=r3;
  IF EXISTS (SELECT 1 FROM public.cuenta_ajustes WHERE aplicado_a_fuente_id=r3) THEN RAISE EXCEPTION 'FAIL cancelación'; END IF;

  RAISE EXCEPTION 'TURNERA_PAYMENT_TESTS_OK';
END $$;
