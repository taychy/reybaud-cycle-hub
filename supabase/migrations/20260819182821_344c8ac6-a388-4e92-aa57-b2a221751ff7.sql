CREATE OR REPLACE FUNCTION public.admin_create_event_reservation(
  p_event_id uuid,
  p_package_id uuid DEFAULT NULL,
  p_alumno_id uuid DEFAULT NULL,
  p_external jsonb DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event record;
  v_pkg record;
  v_active_pkgs int;
  v_price numeric;
  v_currency text;
  v_stage_id uuid;
  v_stage_nombre text;
  v_inscription_only boolean;
  v_plan_ids uuid[];
  v_plan_id uuid;
  v_plan_nombre text;
  v_ext_id uuid;
  v_ext_email text;
  v_res_id uuid;
  v_amount numeric;
  v_payment_status text;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo un admin puede crear reservas manualmente';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evento no encontrado'; END IF;

  IF (p_alumno_id IS NULL) = (p_external IS NULL) THEN
    RAISE EXCEPTION 'Indicá un alumno o los datos de un participante externo (no ambos)';
  END IF;

  v_inscription_only := COALESCE(v_event.nature, '') = 'propio_solo_inscripcion';

  SELECT count(*) INTO v_active_pkgs
  FROM public.event_packages WHERE event_id = p_event_id AND activo = true;

  -- Paquete obligatorio cuando el evento tiene paquetes comerciales activos
  IF p_package_id IS NULL AND v_active_pkgs > 0 AND NOT v_inscription_only THEN
    RAISE EXCEPTION 'Este evento tiene paquetes configurados: elegí un paquete para crear la reserva';
  END IF;

  IF p_package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.event_packages WHERE id = p_package_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Paquete no encontrado'; END IF;
    IF v_pkg.event_id <> p_event_id THEN
      RAISE EXCEPTION 'El paquete no pertenece a este evento';
    END IF;
    IF NOT v_pkg.activo THEN
      RAISE EXCEPTION 'El paquete "%" está inactivo y no puede usarse para una nueva alta', v_pkg.nombre;
    END IF;

    SELECT precio, currency, stage_id, stage_nombre
      INTO v_price, v_currency, v_stage_id, v_stage_nombre
    FROM public.get_package_active_price(p_package_id, now());

    v_price := COALESCE(v_price, v_pkg.precio, 0);
    v_currency := COALESCE(v_currency, v_pkg.currency, v_event.currency, 'ARS');

    -- Plan de pagos determinístico del MISMO paquete
    SELECT array_agg(id ORDER BY version DESC, created_at DESC)
      INTO v_plan_ids
    FROM public.event_package_payment_plans
    WHERE package_id = p_package_id AND activo = true AND archived_at IS NULL;

    IF v_plan_ids IS NOT NULL AND array_length(v_plan_ids, 1) = 1 THEN
      v_plan_id := v_plan_ids[1];
    ELSIF v_plan_ids IS NOT NULL AND array_length(v_plan_ids, 1) > 1 THEN
      -- Regla determinística existente: plan del stage vigente si lo hay
      SELECT id INTO v_plan_id
      FROM public.event_package_payment_plans
      WHERE package_id = p_package_id AND activo = true AND archived_at IS NULL
        AND price_stage_id IS NOT DISTINCT FROM v_stage_id
      ORDER BY version DESC, created_at DESC
      LIMIT 1;

      IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'El paquete "%" tiene % planes de pago activos y no se puede resolver cuál corresponde. Revisá la configuración del paquete antes de dar de alta.', v_pkg.nombre, array_length(v_plan_ids, 1);
      END IF;
    END IF;

    IF v_plan_id IS NOT NULL THEN
      SELECT nombre INTO v_plan_nombre FROM public.event_package_payment_plans WHERE id = v_plan_id;
    END IF;
  ELSE
    v_price := COALESCE(v_event.price, 0);
    v_currency := COALESCE(v_event.currency, 'ARS');
  END IF;

  IF v_inscription_only THEN
    v_amount := 0;
  ELSE
    v_amount := COALESCE(v_price, 0);
  END IF;
  v_payment_status := CASE WHEN v_amount > 0 THEN 'no_informado' ELSE 'no_aplica' END;

  -- Participante externo (misma transacción: si falla la reserva, no queda huérfano)
  IF p_external IS NOT NULL THEN
    v_ext_email := lower(trim(COALESCE(p_external->>'email', '')));
    IF v_ext_email = '' OR COALESCE(trim(p_external->>'nombre'), '') = '' THEN
      RAISE EXCEPTION 'Nombre y email son obligatorios para un participante externo';
    END IF;

    SELECT id INTO v_ext_id FROM public.event_external_participants
    WHERE lower(email) = v_ext_email LIMIT 1;

    IF v_ext_id IS NULL THEN
      INSERT INTO public.event_external_participants (nombre, apellido, email, telefono, documento, estado)
      VALUES (trim(p_external->>'nombre'), NULLIF(trim(COALESCE(p_external->>'apellido','')), ''),
              v_ext_email, NULLIF(trim(COALESCE(p_external->>'telefono','')), ''),
              NULLIF(trim(COALESCE(p_external->>'documento','')), ''), 'activo')
      RETURNING id INTO v_ext_id;
    ELSE
      UPDATE public.event_external_participants
      SET nombre = trim(p_external->>'nombre'),
          apellido = COALESCE(NULLIF(trim(COALESCE(p_external->>'apellido','')), ''), apellido),
          telefono = COALESCE(NULLIF(trim(COALESCE(p_external->>'telefono','')), ''), telefono),
          documento = COALESCE(NULLIF(trim(COALESCE(p_external->>'documento','')), ''), documento),
          estado = 'activo'
      WHERE id = v_ext_id;
    END IF;
  END IF;

  -- Duplicados
  IF p_alumno_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.event_reservations
    WHERE event_id = p_event_id AND alumno_id = p_alumno_id AND cancelled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Este alumno ya tiene una reserva activa en este evento';
  END IF;

  IF v_ext_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.event_reservations
    WHERE event_id = p_event_id AND lower(external_email) = v_ext_email AND cancelled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Ya existe una reserva activa con ese email en este evento';
  END IF;

  INSERT INTO public.event_reservations (
    event_id, alumno_id, external_participant_id,
    external_email, external_first_name, external_last_name,
    package_id, package_nombre_snapshot,
    reservation_status, payment_status, estado, metodo_pago,
    amount_total, amount_paid, balance_due,
    price_snapshot, currency_snapshot, moneda, monto,
    payment_plan_id, created_by, confirmed_at
  ) VALUES (
    p_event_id, p_alumno_id, v_ext_id,
    v_ext_email,
    CASE WHEN p_external IS NOT NULL THEN trim(p_external->>'nombre') END,
    CASE WHEN p_external IS NOT NULL THEN NULLIF(trim(COALESCE(p_external->>'apellido','')), '') END,
    p_package_id, v_pkg.nombre,
    'reserva_confirmada', v_payment_status, 'reserva_confirmada',
    CASE WHEN v_amount > 0 THEN 'pendiente' ELSE 'no_aplica' END,
    v_amount, 0, v_amount,
    v_amount, v_currency, v_currency, v_amount,
    v_plan_id, 'admin', now()
  ) RETURNING id INTO v_res_id;

  INSERT INTO public.reservation_status_history
    (reservation_id, old_reservation_status, new_reservation_status,
     old_payment_status, new_payment_status, changed_by, changed_by_role, note)
  VALUES (v_res_id, NULL, 'reserva_confirmada', NULL, v_payment_status, auth.uid(), 'admin',
          COALESCE(p_note, 'Alta manual desde admin') ||
          CASE WHEN p_package_id IS NOT NULL
               THEN ' · paquete ' || COALESCE(v_pkg.nombre, '?') ||
                    ' · etapa ' || COALESCE(v_stage_nombre, 'precio base') ||
                    ' · precio ' || v_amount::text || ' ' || v_currency ||
                    COALESCE(' · plan ' || v_plan_nombre, ' · sin plan de pagos')
               ELSE ' · sin paquete (precio del evento) · ' || v_amount::text || ' ' || v_currency
          END);

  RETURN jsonb_build_object(
    'ok', true,
    'reservation_id', v_res_id,
    'external_participant_id', v_ext_id,
    'package_id', p_package_id,
    'price', v_amount,
    'currency', v_currency,
    'stage_id', v_stage_id,
    'stage_nombre', v_stage_nombre,
    'payment_plan_id', v_plan_id,
    'payment_plan_nombre', v_plan_nombre
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_event_reservation(uuid, uuid, uuid, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_event_reservation(uuid, uuid, uuid, jsonb, text) TO authenticated, service_role;