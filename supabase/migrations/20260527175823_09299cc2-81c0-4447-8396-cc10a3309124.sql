CREATE OR REPLACE FUNCTION public.recalculate_reservation_amount_total(p_reservation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id uuid;
  v_base numeric := 0;
  v_addons_total numeric := 0;
  v_paid numeric := 0;
  v_condoned numeric := 0;
  v_new_total numeric;
BEGIN
  -- Usar price_snapshot de la reserva si está cargado (override por participante),
  -- sino caer al price del evento.
  SELECT er.event_id, COALESCE(er.price_snapshot, e.price, 0)
    INTO v_event_id, v_base
  FROM public.event_reservations er
  JOIN public.events e ON e.id = er.event_id
  WHERE er.id = p_reservation_id;
  IF v_event_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_addons_total
  FROM public.reservation_addons WHERE reservation_id = p_reservation_id;

  v_new_total := v_base + v_addons_total;

  SELECT COALESCE(amount_paid, 0) INTO v_paid
  FROM public.event_reservations WHERE id = p_reservation_id;

  SELECT COALESCE(SUM(condoned_amount), 0) INTO v_condoned
  FROM public.reservation_installments WHERE reservation_id = p_reservation_id;

  UPDATE public.event_reservations
  SET amount_total = v_new_total,
      balance_due = GREATEST(v_new_total - v_paid - v_condoned, 0),
      updated_at = now()
  WHERE id = p_reservation_id;
END;
$function$;