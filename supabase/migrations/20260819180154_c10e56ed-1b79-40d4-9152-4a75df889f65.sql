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
  IF auth.uid() IS NOT NULL
     AND NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo un admin puede re-vincular el plan de pagos';
  END IF;

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

  SELECT count(*), min(id) INTO v_count, v_target
  FROM public.event_package_payment_plans
  WHERE package_id = v_res.package_id
    AND activo = true
    AND nombre IS NOT DISTINCT FROM v_plan_nombre
    AND cantidad_cuotas IS NOT DISTINCT FROM v_plan_cuotas;

  IF v_count <> 1 THEN
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

REVOKE EXECUTE ON FUNCTION public.relink_reservation_payment_plan(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_reservation_price_snapshot(uuid, numeric, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.relink_reservation_payment_plan(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_reservation_price_snapshot(uuid, numeric, text) TO authenticated, service_role;