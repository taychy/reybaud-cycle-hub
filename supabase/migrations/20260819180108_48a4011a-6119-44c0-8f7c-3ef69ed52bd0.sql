-- 1) Re-vinculación determinística del plan de pagos al paquete de la reserva
CREATE OR REPLACE FUNCTION public.relink_reservation_payment_plan(
  p_reservation_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_res record;
  v_plan_pkg uuid;
  v_plan_nombre text;
  v_plan_cuotas int;
  v_target uuid;
  v_target_nombre text;
  v_count int;
BEGIN
  SELECT * INTO v_res FROM public.event_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;

  IF v_res.package_id IS NULL OR v_res.payment_plan_id IS NULL THEN
    RETURN jsonb_build_object('relinked', false, 'reason', 'sin_paquete_o_sin_plan');
  END IF;

  SELECT package_id, nombre, cantidad_cuotas
    INTO v_plan_pkg, v_plan_nombre, v_plan_cuotas
  FROM public.event_package_payment_plans
  WHERE id = v_res.payment_plan_id;

  IF v_plan_pkg IS NULL THEN
    RETURN jsonb_build_object('relinked', false, 'reason', 'plan_inexistente');
  END IF;

  IF v_plan_pkg = v_res.package_id THEN
    RETURN jsonb_build_object('relinked', false, 'reason', 'ya_coincide');
  END IF;

  -- Candidato 1: mismo nombre + misma cantidad de cuotas, activo, en el paquete destino
  SELECT count(*), min(id) INTO v_count, v_target
  FROM public.event_package_payment_plans
  WHERE package_id = v_res.package_id
    AND activo = true
    AND nombre IS NOT DISTINCT FROM v_plan_nombre
    AND cantidad_cuotas IS NOT DISTINCT FROM v_plan_cuotas;

  IF v_count <> 1 THEN
    -- Candidato 2: misma cantidad de cuotas, activo
    SELECT count(*), min(id) INTO v_count, v_target
    FROM public.event_package_payment_plans
    WHERE package_id = v_res.package_id
      AND activo = true
      AND cantidad_cuotas IS NOT DISTINCT FROM v_plan_cuotas;
  END IF;

  IF v_count <> 1 OR v_target IS NULL THEN
    RETURN jsonb_build_object(
      'relinked', false,
      'reason', 'ambiguo',
      'warning', 'El plan de pagos sigue apuntando al paquete anterior y no hay un plan activo equivalente único en el paquete destino. Revisalo manualmente.',
      'candidates', v_count
    );
  END IF;

  SELECT nombre INTO v_target_nombre
  FROM public.event_package_payment_plans WHERE id = v_target;

  UPDATE public.event_reservations
  SET payment_plan_id = v_target,
      payment_plan_name_snapshot = COALESCE(v_target_nombre, payment_plan_name_snapshot),
      updated_at = now()
  WHERE id = p_reservation_id;

  INSERT INTO public.reservation_status_history
    (reservation_id, old_reservation_status, new_reservation_status,
     old_payment_status, new_payment_status, changed_by, changed_by_role, note)
  VALUES (p_reservation_id, v_res.reservation_status, v_res.reservation_status,
          v_res.payment_status, v_res.payment_status, auth.uid(), 'admin',
          COALESCE(p_note, 'Re-vinculación de plan de pagos') ||
          ' · plan ' || v_res.payment_plan_id::text || ' → ' || v_target::text ||
          ' (no se regeneraron pagos ni cuotas)');

  RETURN jsonb_build_object(
    'relinked', true,
    'old_plan_id', v_res.payment_plan_id,
    'new_plan_id', v_target
  );
END;
$function$;

-- 2) Edición atómica del precio base del participante
CREATE OR REPLACE FUNCTION public.admin_set_reservation_price_snapshot(
  p_reservation_id uuid,
  p_price numeric DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_res record;
  v_default_price numeric;
  v_new_price numeric;
  v_after record;
  v_touched int := 0;
BEGIN
  v_is_admin := has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid());
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo un admin puede editar el precio del participante';
  END IF;

  SELECT * INTO v_res FROM public.event_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;

  -- Precio de referencia: paquete si lo hay, sino el del evento
  SELECT COALESCE(
           (SELECT ep.precio FROM public.event_packages ep WHERE ep.id = v_res.package_id),
           (SELECT e.price FROM public.events e WHERE e.id = v_res.event_id),
           0
         )
    INTO v_default_price;

  v_new_price := ROUND(COALESCE(p_price, v_default_price)::numeric, 2);
  IF v_new_price < 0 THEN
    RAISE EXCEPTION 'El precio no puede ser negativo';
  END IF;

  UPDATE public.event_reservations
  SET price_snapshot = v_new_price,
      updated_at = now()
  WHERE id = p_reservation_id;

  -- Total = precio + extras (no toca pagos)
  PERFORM public.recalculate_reservation_amount_total(p_reservation_id);
  -- Pagado / saldo / estado a partir de los pagos validados existentes
  PERFORM public.recalculate_reservation_payment_totals(p_reservation_id);
  -- Redistribuye SÓLO cuotas abiertas (excluye pagadas y condonadas)
  v_touched := public.rebalance_reservation_installments(p_reservation_id);

  SELECT amount_total, amount_paid, balance_due, payment_status, reservation_status
    INTO v_after
  FROM public.event_reservations WHERE id = p_reservation_id;

  INSERT INTO public.reservation_status_history
    (reservation_id, old_reservation_status, new_reservation_status,
     old_payment_status, new_payment_status, changed_by, changed_by_role, note)
  VALUES (p_reservation_id, v_res.reservation_status, v_after.reservation_status,
          v_res.payment_status, v_after.payment_status, auth.uid(), 'admin',
          COALESCE(p_note, 'Edición de precio base del participante') ||
          ' · precio ' || COALESCE(v_res.price_snapshot, 0)::text || ' → ' || v_new_price::text ||
          ' · total ' || COALESCE(v_res.amount_total, 0)::text || ' → ' || COALESCE(v_after.amount_total, 0)::text ||
          ' · saldo ' || COALESCE(v_after.balance_due, 0)::text ||
          ' · cuotas rebalanceadas: ' || v_touched::text);

  RETURN jsonb_build_object(
    'ok', true,
    'price_snapshot', v_new_price,
    'default_price', v_default_price,
    'amount_total', v_after.amount_total,
    'amount_paid', v_after.amount_paid,
    'balance_due', v_after.balance_due,
    'payment_status', v_after.payment_status,
    'installments_rebalanced', v_touched
  );
END;
$function$;

-- 3) apply_package_change: auditoría con columnas correctas (sin silenciar el error)
--    + re-vinculación determinística del plan antes del rebalanceo
CREATE OR REPLACE FUNCTION public.apply_package_change(
  p_reservation_id uuid,
  p_package_nuevo_id uuid,
  p_revalidation_token text,
  p_request_id uuid DEFAULT NULL::uuid,
  p_override_plaza_libre boolean DEFAULT false,
  p_admin_note text DEFAULT NULL::text,
  p_price_override numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_preview jsonb;
  v_status text;
  v_credit numeric;
  v_debit numeric;
  v_precio_nuevo numeric;
  v_currency_nuevo text;
  v_reservation record;
  v_event record;
  v_pkg_nuevo record;
  v_is_admin boolean;
  v_adj_id uuid;
  v_relink jsonb;
BEGIN
  v_is_admin := has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid());

  IF p_price_override IS NOT NULL AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo un admin puede aplicar un precio manual';
  END IF;

  SELECT * INTO v_reservation FROM public.event_reservations
    WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_reservation.event_id;
  SELECT * INTO v_pkg_nuevo FROM public.event_packages WHERE id = p_package_nuevo_id FOR UPDATE;

  v_preview := public.preview_package_change(p_reservation_id, p_package_nuevo_id, NULL, p_price_override);
  v_status := v_preview->>'status';

  IF v_status = 'no_posible' THEN
    RAISE EXCEPTION 'El cambio no es posible: %', v_preview->'blockers';
  END IF;

  IF (v_preview->>'revalidation_token') IS DISTINCT FROM p_revalidation_token THEN
    RAISE EXCEPTION 'El estado del paquete cambió mientras confirmabas. Recargá y volvé a intentar.';
  END IF;

  IF v_status = 'requiere_aprobacion' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Este cambio requiere aprobación admin. Enviá una solicitud.';
  END IF;

  v_credit := COALESCE((v_preview->>'credit_to_create')::numeric, 0);
  v_debit := COALESCE((v_preview->>'debit_to_create')::numeric, 0);
  v_precio_nuevo := (v_preview->'package_nuevo'->>'precio_aplicable')::numeric;
  v_currency_nuevo := v_preview->'package_nuevo'->>'currency';

  -- Auditoría (columnas reales de reservation_status_history; si falla, falla el cambio)
  INSERT INTO public.reservation_status_history
    (reservation_id, old_reservation_status, new_reservation_status,
     old_payment_status, new_payment_status, changed_by, changed_by_role, note)
  VALUES (p_reservation_id, v_reservation.reservation_status, v_reservation.reservation_status,
          v_reservation.payment_status, v_reservation.payment_status,
          auth.uid(),
          CASE WHEN v_is_admin THEN 'admin' ELSE 'alumno' END,
          CASE WHEN p_price_override IS NOT NULL
               THEN 'Cambio de paquete (precio manual admin)'
               ELSE 'Cambio de paquete' END
          || ' · de ' || COALESCE(v_reservation.package_id::text, '—')
          || ' a ' || p_package_nuevo_id::text
          || CASE WHEN p_price_override IS NOT NULL
                  THEN ' · precio manual ' || p_price_override::text ELSE '' END);

  UPDATE public.event_reservations SET
    package_id = p_package_nuevo_id,
    package_nombre_snapshot = v_pkg_nuevo.nombre,
    price_snapshot = CASE
      WHEN p_price_override IS NOT NULL THEN v_precio_nuevo
      WHEN v_event.politica_precio_cambio = 'conserva_etapa' THEN v_reservation.price_snapshot
      ELSE v_precio_nuevo
    END,
    currency_snapshot = v_currency_nuevo,
    amount_total = CASE
      WHEN p_price_override IS NOT NULL THEN v_precio_nuevo
      WHEN v_event.politica_precio_cambio = 'conserva_etapa' THEN v_reservation.amount_total
      ELSE v_precio_nuevo
    END,
    balance_due = GREATEST(v_precio_nuevo - v_reservation.amount_paid, 0),
    updated_at = now()
  WHERE id = p_reservation_id;

  IF v_credit > 0 THEN
    INSERT INTO public.reservation_financial_adjustments
      (reservation_id, alumno_id, event_id, tipo, monto_original, monto_disponible, moneda,
       origen_cambio_id, motivo, created_by, vence_el)
    VALUES (p_reservation_id, v_reservation.alumno_id, v_reservation.event_id,
            'credito_por_downgrade', v_credit, v_credit, v_currency_nuevo,
            p_request_id, COALESCE(p_admin_note, 'Cambio a paquete más económico'), auth.uid(),
            CASE WHEN v_event.credito_valido_solo_en_evento
                 AND v_event.date IS NOT NULL
                 THEN (v_event.date::timestamptz + interval '30 days')
                 ELSE NULL END)
    RETURNING id INTO v_adj_id;
  ELSIF v_debit > 0 THEN
    INSERT INTO public.reservation_financial_adjustments
      (reservation_id, alumno_id, event_id, tipo, monto_original, monto_disponible, moneda,
       origen_cambio_id, motivo, created_by)
    VALUES (p_reservation_id, v_reservation.alumno_id, v_reservation.event_id,
            'debito_por_upgrade', v_debit, 0, v_currency_nuevo,
            p_request_id, COALESCE(p_admin_note, 'Cambio a paquete de mayor valor'), auth.uid())
    RETURNING id INTO v_adj_id;
  END IF;

  IF p_request_id IS NOT NULL THEN
    UPDATE public.event_package_change_requests
      SET estado = 'aplicada',
          applied_at = now(),
          resolved_at = COALESCE(resolved_at, now()),
          resolved_by = COALESCE(resolved_by, auth.uid()),
          override_plaza_libre = p_override_plaza_libre,
          nota_admin = COALESCE(nota_admin, p_admin_note)
      WHERE id = p_request_id;
  END IF;

  BEGIN
    INSERT INTO public.student_activity_log
      (alumno_id, event_type, title, description, actor_id, actor_role, reference_type, reference_id)
    VALUES (v_reservation.alumno_id, 'package_change',
            'Cambio de paquete aplicado',
            'De ' || COALESCE(v_reservation.package_nombre_snapshot,'—') || ' a ' || v_pkg_nuevo.nombre
              || CASE WHEN p_price_override IS NOT NULL THEN ' (precio manual)' ELSE '' END,
            auth.uid(),
            CASE WHEN v_is_admin THEN 'admin' ELSE 'alumno' END,
            'event_reservation', p_reservation_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Re-vincular el plan de pagos al equivalente activo del paquete destino
  -- (no regenera pagos ni cuotas). Si es ambiguo, devuelve warning.
  v_relink := public.relink_reservation_payment_plan(
    p_reservation_id,
    'Cambio de paquete: re-vinculación de plan'
  );

  -- Rebalanceo de cuotas abiertas al nuevo total
  PERFORM public.rebalance_reservation_installments(p_reservation_id);

  RETURN jsonb_build_object(
    'ok', true,
    'reservation_id', p_reservation_id,
    'new_package_id', p_package_nuevo_id,
    'adjustment_id', v_adj_id,
    'credit_created', v_credit,
    'debit_created', v_debit,
    'price_source', v_preview->>'price_source',
    'payment_plan_relink', v_relink,
    'warning', v_relink->>'warning'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.relink_reservation_payment_plan(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_reservation_price_snapshot(uuid, numeric, text) TO authenticated;