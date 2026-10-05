CREATE OR REPLACE FUNCTION public.enqueue_suscripcion_facturacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pago text; v_monto numeric; v_plan_nombre text; v_plan_precio numeric; v_plan_moneda text;
  v_nombre text; v_doc text; v_cuenta uuid;
BEGIN
  IF NEW.mp_status = 'approved' AND NEW.mp_payment_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.mp_status IS DISTINCT FROM 'approved' OR OLD.mp_payment_id IS DISTINCT FROM NEW.mp_payment_id) THEN
    v_pago := NEW.mp_payment_id;
  ELSE
    RETURN NEW;
  END IF;

  BEGIN
    SELECT p.nombre, p.precio, p.moneda INTO v_plan_nombre, v_plan_precio, v_plan_moneda FROM public.planes p WHERE p.id = NEW.plan_id;
    v_monto := COALESCE(NEW.precio_final, NEW.precio_base, v_plan_precio, 0);
    IF v_monto <= 0 THEN RETURN NEW; END IF;
    SELECT COALESCE(NULLIF(TRIM(a.nombre_fiscal),''), NULLIF(TRIM(CONCAT(a.nombre,' ',a.apellido)),''), '—'), a.documento
      INTO v_nombre, v_doc FROM public.alumnos a WHERE a.id = NEW.alumno_id;

    -- Solo la cuenta que realmente recibió el cobro; nunca se infiere por el ruteo vigente
    v_cuenta := NEW.cuenta_mp_id;

    INSERT INTO public.facturacion_cola (
      source, pago_id, referencia_tipo, referencia_id, alumno_id, cliente_nombre, cliente_cuit, concepto,
      monto, moneda, segmento, metodo_pago, origen_registro, pagado_at, periodo_pago, periodo_operativo, ingreso, cuenta_mp_id
    ) VALUES (
      'suscripcion', v_pago, 'suscripcion', NEW.id, NEW.alumno_id, COALESCE(v_nombre,'—'), v_doc,
      CONCAT('Suscripción ', COALESCE(v_plan_nombre,'')), v_monto, COALESCE(v_plan_moneda,'ARS'), 'escuela',
      COALESCE(NEW.metodo_pago, 'mercadopago'), NEW.origen_registro, now(),
      date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
      COALESCE(date_trunc('month', NEW.fecha_inicio)::date, date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date),
      'automatico', v_cuenta
    )
    ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'facturacion_cola suscripcion %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;