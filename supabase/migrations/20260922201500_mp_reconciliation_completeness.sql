-- Conciliación MP: usar "Todas las transacciones" como backstop de completitud
-- y reutilizar la misma lógica canónica de Gastos al asociar egresos con eventos.

CREATE OR REPLACE FUNCTION public.classify_mp_movement_direccion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  op text;
  sub_unit text;
  collector_id_txt text;
  top_collector text;
  payer_id_txt text;
  report_net numeric;
BEGIN
  IF NEW.raw ? 'settlement_report' THEN
    BEGIN
      report_net := NULLIF(
        replace(COALESCE(NEW.raw->'settlement_report'->>'SETTLEMENT_NET_AMOUNT',''), ',', '.'),
        ''
      )::numeric;
    EXCEPTION WHEN OTHERS THEN
      report_net := NULL;
    END;

    IF report_net IS NOT NULL AND report_net <> 0 THEN
      NEW.direccion := CASE WHEN report_net < 0 THEN 'egreso' ELSE 'ingreso' END;
      RETURN NEW;
    END IF;
  END IF;

  op := (NEW.raw->>'operation_type');
  sub_unit := (NEW.raw->'point_of_interaction'->'business_info'->>'sub_unit');
  collector_id_txt := (NEW.raw->'collector'->>'id');
  top_collector := (NEW.raw->>'collector_id');
  payer_id_txt := (NEW.raw->'payer'->>'id');

  IF op = 'partition_transfer' THEN
    NEW.direccion := 'interno';
  ELSIF sub_unit = 'money_outflows'
        AND top_collector IS NOT NULL AND top_collector <> ''
        AND COALESCE(payer_id_txt, '') <> top_collector THEN
    NEW.direccion := 'ingreso';
  ELSIF sub_unit = 'money_outflows' THEN
    NEW.direccion := 'egreso';
  ELSIF op = 'regular_payment' AND collector_id_txt IS NOT NULL AND collector_id_txt <> '' THEN
    NEW.direccion := 'egreso';
  ELSIF op IN ('money_transfer','account_fund','transfer') AND COALESCE(NEW.amount,0) > 0
        AND (NEW.raw->>'status_detail') IN ('accredited','partially_refunded')
        AND (NEW.raw->>'payment_type_id') IN ('bank_transfer','account_money')
        AND (NEW.raw->'payer'->>'type') = 'collector' THEN
    NEW.direccion := 'egreso';
  ELSIF op = 'money_transfer' AND COALESCE(NEW.amount,0) > 0
        AND (NEW.raw->'payer'->>'id') = (NEW.raw->'collector'->>'id') THEN
    NEW.direccion := 'egreso';
  ELSE
    NEW.direccion := 'ingreso';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_mp_viajes_outflow_to_event(
  p_movement_id uuid,
  p_event_id uuid,
  p_categoria text DEFAULT 'Otros',
  p_descripcion text DEFAULT NULL,
  p_proveedor text DEFAULT NULL,
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m public.mp_account_movements%ROWTYPE;
  v_gasto public.gastos%ROWTYPE;
  v_gasto_id uuid;
  v_is_travel_account boolean;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo un admin puede asociar salidas MP a eventos';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id=p_event_id) THEN
    RAISE EXCEPTION 'Evento no encontrado';
  END IF;

  SELECT * INTO m
  FROM public.mp_account_movements
  WHERE id=p_movement_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento MP no encontrado'; END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.cuenta_mp_routing r
    WHERE r.cuenta_mp_id=m.cuenta_mp_id
      AND r.activa=true
      AND r.unidad_negocio::text IN ('viaje_camp','evento')
  ) INTO v_is_travel_account;

  IF NOT v_is_travel_account THEN
    RAISE EXCEPTION 'El movimiento no pertenece a la cuenta MP de Viajes/Eventos';
  END IF;

  IF m.direccion <> 'egreso' OR COALESCE(m.status,'') <> 'approved' THEN
    RAISE EXCEPTION 'Sólo se pueden asociar egresos MP aprobados';
  END IF;

  IF m.gasto_id IS NOT NULL THEN
    SELECT * INTO v_gasto FROM public.gastos WHERE id=m.gasto_id FOR UPDATE;
    IF FOUND THEN
      IF v_gasto.event_id IS NOT NULL AND v_gasto.event_id <> p_event_id THEN
        RAISE EXCEPTION 'Este egreso ya está asociado a otro evento';
      END IF;
      UPDATE public.gastos
         SET event_id=p_event_id,
             unidad_negocio='viajes',
             updated_at=now()
       WHERE id=v_gasto.id;
      RETURN v_gasto.id;
    END IF;
  END IF;

  v_gasto_id := public.mp_egreso_to_gasto(
    p_movement_id,
    COALESCE(NULLIF(trim(p_categoria),''),'Otros'),
    NULL,
    COALESCE(NULLIF(trim(COALESCE(p_descripcion,'')),''),
             NULLIF(trim(COALESCE(m.description,'')),''),
             'Egreso MP Viajes ' || m.mp_payment_id),
    NULLIF(trim(COALESCE(p_proveedor,'')),''),
    'viajes',
    NULLIF(trim(COALESCE(p_notas,'')),'')
  );

  UPDATE public.gastos
     SET event_id=p_event_id,
         unidad_negocio='viajes',
         forma_pago='mp_scarlett_viajes',
         origen_registro=CASE
           WHEN origen_registro IN ('mp_egreso','mp_egreso_auto') THEN origen_registro
           ELSE COALESCE(origen_registro,'mp_egreso')
         END,
         updated_at=now()
   WHERE id=v_gasto_id;

  RETURN v_gasto_id;
END;
$function$;
