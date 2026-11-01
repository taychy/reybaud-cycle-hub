CREATE OR REPLACE FUNCTION public.admin_purge_test_reservation(p_reservation_id uuid, p_confirm text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_res public.event_reservations%ROWTYPE;
  v_blockers text[] := '{}';
  v_counts jsonb := '{}'::jsonb;
  v_n int;
  v_t text;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_confirm, '') <> 'ELIMINAR PRUEBA' THEN
    RAISE EXCEPTION 'Confirmación inválida: escribí ELIMINAR PRUEBA';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Indicá el motivo de la limpieza (registro de prueba)';
  END IF;

  SELECT * INTO v_res FROM public.event_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva inexistente'; END IF;

  -- Bloqueos: cualquier rastro de dinero, crédito o trazabilidad operativa real.
  IF coalesce(v_res.amount_paid, 0) > 0 THEN v_blockers := v_blockers || 'monto pagado'; END IF;
  FOREACH v_t IN ARRAY ARRAY[
    'reservation_payments','devoluciones','reservation_refund_obligations','reservation_financial_adjustments',
    'reservation_cash_announcements','reservation_payment_intents','gastos','training_camp_credit_accounts:source_reservation_id',
    'training_camp_credit_ledger:target_reservation_id','reservation_transfers:original_reservation_id',
    'reservation_transfers:replacement_reservation_id','rescheduling_settlement_proposals','rescheduling_seat_releases:source_reservation_id',
    'rescheduling_seat_occupancies:replacement_reservation_id','event_crosssell_links:source_reservation_id',
    'event_crosssell_links:used_reservation_id','event_waitlist_entries:converted_reservation_id',
    'extra_night_pairings','extra_night_pairings:partner_reservation_id','event_accommodation_waitlist_requests']
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1',
      split_part(v_t, ':', 1), coalesce(nullif(split_part(v_t, ':', 2), ''), 'reservation_id'))
      INTO v_n USING p_reservation_id;
    IF v_n > 0 THEN v_blockers := v_blockers || split_part(v_t, ':', 1); END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM public.reservation_installments
   WHERE reservation_id = p_reservation_id AND (coalesce(monto_pagado,0) > 0 OR coalesce(paid_amount,0) > 0 OR coalesce(condoned_amount,0) > 0);
  IF v_n > 0 THEN v_blockers := v_blockers || 'cuotas con pagos'; END IF;
  SELECT count(*) INTO v_n FROM public.reservation_addons ra
   WHERE ra.reservation_id = p_reservation_id AND coalesce((to_jsonb(ra)->>'amount_paid')::numeric, 0) > 0;
  IF v_n > 0 THEN v_blockers := v_blockers || 'extras pagados'; END IF;

  IF array_length(v_blockers, 1) > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar: tiene datos reales (%). Usá Cancelar para conservar historial.', array_to_string(v_blockers, ', ');
  END IF;

  -- Inventario de dependencias de prueba que se limpian explícitamente
  FOREACH v_t IN ARRAY ARRAY['reservation_status_history','reservation_notifications','reservation_checklist_data',
    'reservation_installments','reservation_addons','reservation_roommates','event_room_assignments',
    'event_package_change_requests','reservation_rescheduling_history','reservation_rescheduling_requests',
    'rescheduling_communications','rescheduling_guest_sessions','trip_additional_day_history',
    'trip_additional_day_responses','event_choice_survey_admin_entries','admin_notification_events']
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE reservation_id = $1', v_t) INTO v_n USING p_reservation_id;
    IF v_n > 0 THEN v_counts := v_counts || jsonb_build_object(v_t, v_n); END IF;
  END LOOP;

  INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (v_uid, auth.email(), 'admin', 'purge_test_reservation', 'event_reservation', p_reservation_id::text,
    jsonb_build_object('reason', trim(p_reason), 'reservation', to_jsonb(v_res), 'dependencies', v_counts));

  UPDATE public.event_participants SET event_reservation_id = NULL WHERE event_reservation_id = p_reservation_id;
  FOREACH v_t IN ARRAY ARRAY['trip_additional_day_history','trip_additional_day_responses','reservation_rescheduling_history',
    'reservation_rescheduling_requests','rescheduling_communications','rescheduling_guest_sessions',
    'event_choice_survey_admin_entries','admin_notification_events','event_package_change_requests',
    'event_room_assignments','reservation_roommates','reservation_addons','reservation_installments',
    'reservation_checklist_data','reservation_notifications','reservation_status_history']
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE reservation_id = $1', v_t) USING p_reservation_id;
  END LOOP;
  DELETE FROM public.event_reservations WHERE id = p_reservation_id;

  RETURN jsonb_build_object('ok', true, 'deleted', p_reservation_id, 'dependencies', v_counts);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_purge_test_reservation(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_test_reservation(uuid, text, text) TO authenticated;