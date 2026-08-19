-- Keep event reservations and lodging assignments consistent.
--
-- Context:
--   A reservation can currently be assigned to a physical room whose package does
--   not match event_reservations.package_id. In the common legacy case package_id
--   is NULL, the room assignment is still valid but the reservation shows
--   "Sin paquete asignado". This happened to Sergio Brukman in San Luis.
--
-- Safety rules:
--   1) If a reservation has no package and an admin assigns it to a room that has
--      a package, inherit that room package WITHOUT changing the negotiated price,
--      paid amount, balance or installments.
--   2) If the reservation already has a different package, reject the room move.
--      A commercial package change must go through the existing package-change flow.
--   3) Repair existing deterministic NULL-package assignments only. Existing
--      non-NULL mismatches are deliberately left untouched for manual review.

CREATE OR REPLACE FUNCTION public.enforce_event_room_package_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room record;
  v_reservation record;
  v_package_name text;
  v_current_package_name text;
  v_actor uuid := auth.uid();
BEGIN
  SELECT r.id, r.event_id, r.package_id, r.nombre
    INTO v_room
  FROM public.event_rooms r
  WHERE r.id = NEW.room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Habitación no encontrada';
  END IF;

  -- Rooms without a package are allowed and do not imply a commercial package.
  IF v_room.package_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT er.id,
         er.event_id,
         er.alumno_id,
         er.package_id,
         er.package_nombre_snapshot,
         er.price_snapshot,
         er.amount_total,
         er.amount_paid,
         er.balance_due,
         er.reservation_status,
         er.payment_status
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

  SELECT ep.nombre
    INTO v_package_name
  FROM public.event_packages ep
  WHERE ep.id = v_room.package_id;

  IF v_package_name IS NULL THEN
    RAISE EXCEPTION 'La habitación tiene un paquete inválido';
  END IF;

  -- Legacy/admin-created reservation with no package: adopt the room package but
  -- preserve the original commercial agreement exactly as it is.
  IF v_reservation.package_id IS NULL THEN
    UPDATE public.event_reservations
    SET package_id = v_room.package_id,
        package_nombre_snapshot = v_package_name,
        updated_at = now()
    WHERE id = v_reservation.id;

    INSERT INTO public.reservation_status_history (
      reservation_id,
      old_reservation_status,
      new_reservation_status,
      old_payment_status,
      new_payment_status,
      changed_by,
      changed_by_role,
      note
    ) VALUES (
      v_reservation.id,
      v_reservation.reservation_status,
      v_reservation.reservation_status,
      v_reservation.payment_status,
      v_reservation.payment_status,
      v_actor,
      CASE WHEN v_actor IS NULL THEN 'system' ELSE 'admin' END,
      format(
        'Paquete sincronizado desde alojamiento: %s. Se conservó el precio acordado (%s), abonado (%s) y saldo (%s).',
        v_package_name,
        COALESCE(v_reservation.amount_total, v_reservation.price_snapshot, 0),
        COALESCE(v_reservation.amount_paid, 0),
        COALESCE(v_reservation.balance_due, 0)
      )
    );

    RETURN NEW;
  END IF;

  -- A room move must never silently perform a commercial package change.
  IF v_reservation.package_id IS DISTINCT FROM v_room.package_id THEN
    SELECT ep.nombre
      INTO v_current_package_name
    FROM public.event_packages ep
    WHERE ep.id = v_reservation.package_id;

    RAISE EXCEPTION USING
      MESSAGE = format(
        'La habitación %s pertenece al paquete "%s", pero la reserva tiene "%s". Cambiá el paquete de la reserva antes de asignar esta habitación.',
        v_room.nombre,
        v_package_name,
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

-- Backfill deterministic legacy cases: active reservations with package_id NULL
-- that already occupy a room with exactly one non-null package.
-- Financial fields are intentionally NOT modified.
WITH candidates AS (
  SELECT er.id AS reservation_id,
         min(room.package_id::text)::uuid AS package_id,
         min(pkg.nombre) AS package_name
  FROM public.event_reservations er
  JOIN public.event_room_assignments a
    ON a.reservation_id = er.id
  JOIN public.event_rooms room
    ON room.id = a.room_id
  JOIN public.event_packages pkg
    ON pkg.id = room.package_id
  WHERE er.package_id IS NULL
    AND room.package_id IS NOT NULL
    AND er.reservation_status NOT IN ('cancelada', 'rechazada', 'expirada')
  GROUP BY er.id
  HAVING count(DISTINCT room.package_id) = 1
), audit_rows AS (
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
  SELECT er.id,
         er.reservation_status,
         er.reservation_status,
         er.payment_status,
         er.payment_status,
         NULL,
         'system',
         format(
           'Backfill: paquete sincronizado desde habitación (%s) sin modificar precio (%s), abonado (%s) ni saldo (%s).',
           c.package_name,
           COALESCE(er.amount_total, er.price_snapshot, 0),
           COALESCE(er.amount_paid, 0),
           COALESCE(er.balance_due, 0)
         )
  FROM candidates c
  JOIN public.event_reservations er ON er.id = c.reservation_id
  RETURNING reservation_id
)
UPDATE public.event_reservations er
SET package_id = c.package_id,
    package_nombre_snapshot = c.package_name,
    updated_at = now()
FROM candidates c
WHERE er.id = c.reservation_id;

COMMENT ON FUNCTION public.enforce_event_room_package_consistency() IS
'Prevents lodging/package drift. A NULL reservation package inherits the assigned room package while preserving negotiated financials; a different existing package is rejected and must use the package-change flow.';
