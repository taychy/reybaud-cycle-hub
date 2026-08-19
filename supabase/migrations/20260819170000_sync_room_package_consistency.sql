-- Keep event reservations and lodging assignments consistent.
--
-- Business rule:
--   A room belongs to a commercial package. If a legacy/admin-created reservation
--   has package_id NULL and is assigned to that room, reconstruct the package AND
--   the price that was valid when the reservation was originally created.
--
-- Important: this is a historical repair, not a package change made today.
-- The price source is event_package_price_stages at event_reservations.created_at
-- (fallback: event_packages.precio when no stage existed at that time).
--
-- Safety rules:
--   1) NULL package + packaged room => inherit package + historical stage price,
--      then recalculate total, payments, balance and pending installments.
--   2) Existing different non-NULL package => reject the room move. Commercial
--      package changes must go through the package-change flow.
--   3) Existing deterministic NULL-package assignments are backfilled.
--   4) Existing non-NULL mismatches are deliberately left for manual review.

CREATE OR REPLACE FUNCTION public.sync_reservation_package_from_room(
  p_reservation_id uuid,
  p_room_package_id uuid,
  p_source text DEFAULT 'alojamiento'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reservation record;
  v_package record;
  v_price numeric;
  v_currency text;
  v_stage_id uuid;
  v_stage_name text;
  v_old_total numeric;
  v_old_paid numeric;
  v_old_balance numeric;
  v_installments_touched integer := 0;
BEGIN
  SELECT * INTO v_reservation
  FROM public.event_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_reservation.package_id IS NOT NULL THEN
    IF v_reservation.package_id = p_room_package_id THEN
      RETURN jsonb_build_object('ok', true, 'changed', false, 'reason', 'package_already_matches');
    END IF;
    RAISE EXCEPTION 'La reserva ya tiene un paquete distinto; usá el flujo de cambio de paquete';
  END IF;

  SELECT id, event_id, nombre, precio, currency
    INTO v_package
  FROM public.event_packages
  WHERE id = p_room_package_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paquete de la habitación no encontrado';
  END IF;

  IF v_package.event_id IS DISTINCT FROM v_reservation.event_id THEN
    RAISE EXCEPTION 'El paquete de la habitación pertenece a otro evento';
  END IF;

  -- Historical source of truth: the stage active when the reservation was created.
  SELECT ap.precio, ap.currency, ap.stage_id, ap.stage_nombre
    INTO v_price, v_currency, v_stage_id, v_stage_name
  FROM public.get_package_active_price(
    p_room_package_id,
    COALESCE(v_reservation.created_at, now())
  ) ap;

  v_price := COALESCE(v_price, v_package.precio, 0);
  v_currency := COALESCE(v_currency, v_package.currency, v_reservation.currency_snapshot, 'ARS');
  v_old_total := COALESCE(v_reservation.amount_total, v_reservation.price_snapshot, 0);
  v_old_paid := COALESCE(v_reservation.amount_paid, 0);
  v_old_balance := COALESCE(v_reservation.balance_due, 0);

  UPDATE public.event_reservations
  SET package_id = p_room_package_id,
      package_nombre_snapshot = v_package.nombre,
      price_snapshot = v_price,
      currency_snapshot = v_currency,
      updated_at = now()
  WHERE id = p_reservation_id;

  -- Recalculate the reservation first (price + addons), then pending installments.
  PERFORM public.recalculate_reservation_amount_total(p_reservation_id);
  v_installments_touched := public.rebalance_reservation_installments(p_reservation_id);

  -- rebalance_reservation_installments recalculates payment totals itself, but do it
  -- explicitly as well so reservations without materialized installments are safe.
  PERFORM public.recalculate_reservation_payment_totals(p_reservation_id);

  INSERT INTO public.reservation_status_history (
    reservation_id,
    old_reservation_status,
    new_reservation_status,
    old_payment_status,
    new_payment_status,
    changed_by,
    changed_by_role,
    note
  )
  SELECT r.id,
         v_reservation.reservation_status,
         r.reservation_status,
         v_reservation.payment_status,
         r.payment_status,
         auth.uid(),
         CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'admin' END,
         format(
           'Corrección paquete/alojamiento (%s): %s. Precio reconstruido según fecha original %s: %s%s. Antes: total %s, abonado %s, saldo %s. Cuotas recalculadas: %s.',
           COALESCE(p_source, 'alojamiento'),
           v_package.nombre,
           to_char(v_reservation.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI'),
           v_price,
           CASE WHEN v_stage_name IS NOT NULL THEN ' (' || v_stage_name || ')' ELSE ' (precio base)' END,
           v_old_total,
           v_old_paid,
           v_old_balance,
           v_installments_touched
         )
  FROM public.event_reservations r
  WHERE r.id = p_reservation_id;

  BEGIN
    INSERT INTO public.student_activity_log (
      alumno_id, event_type, title, description, actor_id, actor_role,
      reference_type, reference_id
    )
    VALUES (
      v_reservation.alumno_id,
      'package_repair',
      'Paquete reconstruido desde alojamiento',
      v_package.nombre || ' · ' || COALESCE(v_stage_name, 'precio base') || ' · ' || v_price::text,
      auth.uid(),
      CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'admin' END,
      'event_reservation',
      p_reservation_id
    );
  EXCEPTION WHEN OTHERS THEN
    -- Activity log is secondary; reservation_status_history above is mandatory.
    NULL;
  END;

  RETURN (
    SELECT jsonb_build_object(
      'ok', true,
      'changed', true,
      'reservation_id', r.id,
      'package_id', r.package_id,
      'package_name', r.package_nombre_snapshot,
      'stage_id', v_stage_id,
      'stage_name', v_stage_name,
      'price', r.price_snapshot,
      'amount_total', r.amount_total,
      'amount_paid', r.amount_paid,
      'balance_due', r.balance_due,
      'installments_touched', v_installments_touched
    )
    FROM public.event_reservations r
    WHERE r.id = p_reservation_id
  );
END;
$function$;

-- Internal helper: only invoked by the trigger/migration under definer rights.
REVOKE ALL ON FUNCTION public.sync_reservation_package_from_room(uuid, uuid, text)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_event_room_package_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room record;
  v_reservation record;
  v_room_package_name text;
  v_current_package_name text;
BEGIN
  SELECT r.id, r.event_id, r.package_id, r.nombre
    INTO v_room
  FROM public.event_rooms r
  WHERE r.id = NEW.room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Habitación no encontrada';
  END IF;

  SELECT er.id, er.event_id, er.package_id, er.package_nombre_snapshot
    INTO v_reservation
  FROM public.event_reservations er
  WHERE er.id = NEW.reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_reservation.event_id IS DISTINCT FROM v_room.event_id THEN
    RAISE EXCEPTION 'La habitación y la reserva pertenecen a eventos distintos';
  END IF;

  -- Rooms without a package do not imply a commercial package.
  IF v_room.package_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nombre INTO v_room_package_name
  FROM public.event_packages
  WHERE id = v_room.package_id;

  IF v_room_package_name IS NULL THEN
    RAISE EXCEPTION 'La habitación tiene un paquete inválido';
  END IF;

  IF v_reservation.package_id IS NULL THEN
    PERFORM public.sync_reservation_package_from_room(
      NEW.reservation_id,
      v_room.package_id,
      'asignación de habitación'
    );
    RETURN NEW;
  END IF;

  -- A room move must never silently perform a commercial package change.
  IF v_reservation.package_id IS DISTINCT FROM v_room.package_id THEN
    SELECT nombre INTO v_current_package_name
    FROM public.event_packages
    WHERE id = v_reservation.package_id;

    RAISE EXCEPTION USING
      MESSAGE = format(
        'La habitación %s pertenece al paquete "%s", pero la reserva tiene "%s". Cambiá el paquete de la reserva antes de asignar esta habitación.',
        v_room.nombre,
        v_room_package_name,
        COALESCE(v_current_package_name, v_reservation.package_nombre_snapshot, 'otro paquete')
      ),
      ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_event_room_package_consistency
  ON public.event_room_assignments;

CREATE TRIGGER trg_event_room_package_consistency
BEFORE INSERT OR UPDATE OF room_id, reservation_id
ON public.event_room_assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_event_room_package_consistency();

-- Backfill deterministic legacy cases. Each reservation must be linked to exactly
-- one non-null room package. The helper reconstructs the historical stage price.
DO $backfill$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT er.id AS reservation_id,
           min(room.package_id::text)::uuid AS room_package_id
    FROM public.event_reservations er
    JOIN public.event_room_assignments a ON a.reservation_id = er.id
    JOIN public.event_rooms room ON room.id = a.room_id
    WHERE er.package_id IS NULL
      AND room.package_id IS NOT NULL
      AND er.reservation_status NOT IN ('cancelada', 'rechazada', 'expirada')
    GROUP BY er.id
    HAVING count(DISTINCT room.package_id) = 1
  LOOP
    PERFORM public.sync_reservation_package_from_room(
      r.reservation_id,
      r.room_package_id,
      'backfill histórico'
    );
  END LOOP;
END;
$backfill$;

COMMENT ON FUNCTION public.enforce_event_room_package_consistency() IS
'Prevents lodging/package drift. NULL-package reservations inherit the assigned room package and the historical package price valid at reservation.created_at; different existing packages are rejected.';

COMMENT ON FUNCTION public.sync_reservation_package_from_room(uuid, uuid, text) IS
'Internal repair helper: reconstructs package + historical stage price from a room package, then recalculates totals, payments, balance and pending installments.';
