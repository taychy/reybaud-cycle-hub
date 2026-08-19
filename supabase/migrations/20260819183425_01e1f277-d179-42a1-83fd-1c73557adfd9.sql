-- 1) Snapshot de plan de pagos calculado en backend (paridad con src/lib/paymentPlanCalculator.ts)
CREATE OR REPLACE FUNCTION public.build_payment_plan_snapshot(
  p_plan_id uuid,
  p_precio_final numeric,
  p_fecha_reserva date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan record;
  v_sena numeric;
  v_saldo numeric;
  v_accum numeric := 0;
  v_count int;
  v_idx int := 0;
  v_monto numeric;
  v_rec record;
  v_cuotas jsonb := '[]'::jsonb;
  v_cuotas_final jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_due date;
  v_cuotas_total numeric := 0;
  v_vencidas numeric := 0;
  v_diff numeric;
  v_template jsonb;
  v_reminders jsonb;
  v_sena_due date;
BEGIN
  SELECT * INTO v_plan FROM public.event_package_payment_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan de pagos % no encontrado', p_plan_id;
  END IF;

  IF COALESCE(p_precio_final, 0) <= 0 THEN
    RAISE EXCEPTION 'El precio final debe ser mayor a 0 para calcular el plan de pagos';
  END IF;

  v_sena := CASE
    WHEN v_plan.sena_tipo = 'monto_fijo' THEN round(COALESCE(v_plan.sena_valor, 0), 2)
    ELSE round(p_precio_final * COALESCE(v_plan.sena_valor, 0) / 100.0, 2)
  END;

  IF v_sena < 0 THEN RAISE EXCEPTION 'La seña no puede ser negativa'; END IF;
  IF v_sena > p_precio_final THEN RAISE EXCEPTION 'La seña no puede ser mayor al precio del paquete'; END IF;

  v_saldo := round(p_precio_final - v_sena, 2);

  SELECT count(*) INTO v_count
  FROM public.event_package_payment_plan_installments WHERE plan_id = p_plan_id;

  IF v_count <> COALESCE(v_plan.cantidad_cuotas, v_count) THEN
    RAISE EXCEPTION 'El plan "%" define % cuotas pero cantidad_cuotas = %. Revisá la configuración del plan.',
      v_plan.nombre, v_count, v_plan.cantidad_cuotas;
  END IF;

  FOR v_rec IN
    SELECT * FROM public.event_package_payment_plan_installments
    WHERE plan_id = p_plan_id ORDER BY numero ASC
  LOOP
    v_idx := v_idx + 1;
    v_monto := CASE
      WHEN v_rec.monto_tipo = 'fijo' THEN round(COALESCE(v_rec.monto_valor, 0), 2)
      ELSE round(v_saldo * COALESCE(v_rec.monto_valor, 0) / 100.0, 2)
    END;

    IF v_idx = v_count AND COALESCE(v_plan.last_installment_absorbs_rounding, false) THEN
      v_monto := round(v_saldo - v_accum, 2);
    ELSE
      v_accum := round(v_accum + v_monto, 2);
    END IF;

    v_reminders := CASE
      WHEN jsonb_typeof(v_rec.reminders_config) = 'array'
           AND jsonb_array_length(v_rec.reminders_config) > 0 THEN v_rec.reminders_config
      WHEN v_idx = v_count THEN '[-14,-7,-2,0,3,7]'::jsonb
      ELSE '[-7,-2,0,3,7]'::jsonb
    END;

    v_due := COALESCE(v_rec.fecha_vencimiento, p_fecha_reserva);

    v_cuotas := v_cuotas || jsonb_build_object(
      'numero', v_rec.numero,
      'installment_type', 'cuota',
      'descripcion', COALESCE(NULLIF(v_rec.descripcion, ''), 'Cuota ' || v_rec.numero::text),
      'monto', v_monto,
      'due_date', to_char(v_due, 'YYYY-MM-DD'),
      'due_date_original', to_char(v_due, 'YYYY-MM-DD'),
      'reprogramada', false,
      'reminders_config', v_reminders
    );
    v_cuotas_total := round(v_cuotas_total + v_monto, 2);
  END LOOP;

  v_diff := round(p_precio_final - v_sena - v_cuotas_total, 2);
  IF abs(v_diff) > 0.01 THEN
    RAISE EXCEPTION 'Plan inválido: seña + cuotas (%) ≠ precio (%). Diferencia %.',
      (v_sena + v_cuotas_total), p_precio_final, v_diff;
  END IF;

  -- Regla de reserva tardía
  FOR v_elem IN SELECT jsonb_array_elements(v_cuotas) LOOP
    v_due := (v_elem->>'due_date')::date;
    IF v_due < p_fecha_reserva THEN
      IF v_plan.regla_reserva_tardia = 'cobrar_al_reservar' THEN
        v_vencidas := round(v_vencidas + (v_elem->>'monto')::numeric, 2);
      ELSIF v_plan.regla_reserva_tardia = 'reprogramar_a_hoy' THEN
        v_cuotas_final := v_cuotas_final || (v_elem
          || jsonb_build_object('due_date', to_char(p_fecha_reserva, 'YYYY-MM-DD'), 'reprogramada', true));
      ELSE
        v_cuotas_final := v_cuotas_final || v_elem;
      END IF;
    ELSE
      v_cuotas_final := v_cuotas_final || v_elem;
    END IF;
  END LOOP;

  v_sena := round(v_sena + v_vencidas, 2);
  v_sena_due := p_fecha_reserva + COALESCE(v_plan.sena_vence_dias, 0);

  SELECT COALESCE(sum((e->>'monto')::numeric), 0) INTO v_cuotas_total
  FROM jsonb_array_elements(v_cuotas_final) e;

  SELECT jsonb_build_object(
    'id', v_plan.id,
    'nombre', v_plan.nombre,
    'sena_tipo', v_plan.sena_tipo,
    'sena_valor', v_plan.sena_valor,
    'sena_vence_dias', COALESCE(v_plan.sena_vence_dias, 0),
    'cantidad_cuotas', v_plan.cantidad_cuotas,
    'last_installment_absorbs_rounding', COALESCE(v_plan.last_installment_absorbs_rounding, false),
    'regla_reserva_tardia', v_plan.regla_reserva_tardia,
    'installments', COALESCE(jsonb_agg(jsonb_build_object(
        'numero', i.numero, 'descripcion', i.descripcion, 'monto_tipo', i.monto_tipo,
        'monto_valor', i.monto_valor,
        'fecha_vencimiento', to_char(i.fecha_vencimiento, 'YYYY-MM-DD'),
        'reminders_config', i.reminders_config) ORDER BY i.numero), '[]'::jsonb)
  ) INTO v_template
  FROM public.event_package_payment_plan_installments i
  WHERE i.plan_id = p_plan_id;

  RETURN jsonb_build_object(
    'version', v_plan.version,
    'template', v_template,
    'precio_final', p_precio_final,
    'fecha_reserva', to_char(p_fecha_reserva, 'YYYY-MM-DD'),
    'calculated', jsonb_build_object(
      'ok', true,
      'total', p_precio_final,
      'sena_monto', v_sena,
      'cuotas_total', v_cuotas_total,
      'diff', 0,
      'errors', '[]'::jsonb,
      'installments', jsonb_build_array(jsonb_build_object(
        'numero', 0,
        'installment_type', 'sena',
        'descripcion', 'Seña',
        'monto', v_sena,
        'due_date', to_char(v_sena_due, 'YYYY-MM-DD'),
        'due_date_original', to_char(v_sena_due, 'YYYY-MM-DD'),
        'reprogramada', false,
        'reminders_config', '[0,1,3]'::jsonb
      )) || v_cuotas_final
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.build_payment_plan_snapshot(uuid, numeric, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.build_payment_plan_snapshot(uuid, numeric, date) TO authenticated, service_role;

-- 2) Guard de integridad: no crear reservas activas sin paquete en eventos con paquetes comerciales
CREATE OR REPLACE FUNCTION public.guard_reservation_package_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_nature text;
  v_active int;
  v_pkg_event uuid;
BEGIN
  -- Sólo aplica a reservas activas y a cambios reales de paquete/evento
  IF NEW.cancelled_at IS NOT NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.package_id IS NOT DISTINCT FROM OLD.package_id
     AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id THEN
    RETURN NEW;
  END IF;

  IF NEW.package_id IS NOT NULL THEN
    SELECT event_id INTO v_pkg_event FROM public.event_packages WHERE id = NEW.package_id;
    IF v_pkg_event IS NULL THEN
      RAISE EXCEPTION 'El paquete indicado no existe';
    END IF;
    IF v_pkg_event <> NEW.event_id THEN
      RAISE EXCEPTION 'El paquete no pertenece al evento de la reserva';
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(nature, '') INTO v_nature FROM public.events WHERE id = NEW.event_id;
  IF v_nature = 'propio_solo_inscripcion' THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_active
  FROM public.event_packages WHERE event_id = NEW.event_id AND activo = true;

  IF v_active > 0 THEN
    RAISE EXCEPTION 'Este evento tiene paquetes comerciales activos: la reserva debe indicar un paquete';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_reservation_package_required ON public.event_reservations;
CREATE TRIGGER trg_guard_reservation_package_required
BEFORE INSERT OR UPDATE OF package_id, event_id, cancelled_at ON public.event_reservations
FOR EACH ROW EXECUTE FUNCTION public.guard_reservation_package_required();

-- 3) Alta admin atómica: plan + snapshot + cuotas dentro de la misma transacción
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
  v_snapshot jsonb;
  v_installments int := 0;
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

    SELECT array_agg(id ORDER BY version DESC, created_at DESC)
      INTO v_plan_ids
    FROM public.event_package_payment_plans
    WHERE package_id = p_package_id AND activo = true AND archived_at IS NULL;

    IF v_plan_ids IS NOT NULL AND array_length(v_plan_ids, 1) = 1 THEN
      v_plan_id := v_plan_ids[1];
    ELSIF v_plan_ids IS NOT NULL AND array_length(v_plan_ids, 1) > 1 THEN
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

  -- El plan sólo aplica si el evento cobra en cuotas y hay monto
  IF v_plan_id IS NOT NULL AND (v_amount <= 0 OR COALESCE(v_event.payment_mode::text, 'cuotas') = 'simple') THEN
    v_plan_id := NULL;
    v_plan_nombre := NULL;
  END IF;

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

  -- Snapshot del plan calculado ANTES de insertar (si falla, no se crea nada)
  IF v_plan_id IS NOT NULL THEN
    v_snapshot := public.build_payment_plan_snapshot(v_plan_id, v_amount, current_date);
  END IF;

  INSERT INTO public.event_reservations (
    event_id, alumno_id, external_participant_id,
    external_email, external_first_name, external_last_name,
    package_id, package_nombre_snapshot,
    reservation_status, payment_status, estado, metodo_pago,
    amount_total, amount_paid, balance_due,
    price_snapshot, currency_snapshot, moneda, monto,
    payment_plan_id, payment_plan_name_snapshot, payment_plan_snapshot,
    created_by, created_at
  ) VALUES (
    p_event_id, p_alumno_id, v_ext_id,
    CASE WHEN p_external IS NOT NULL THEN v_ext_email END,
    CASE WHEN p_external IS NOT NULL THEN trim(p_external->>'nombre') END,
    CASE WHEN p_external IS NOT NULL THEN NULLIF(trim(COALESCE(p_external->>'apellido','')), '') END,
    p_package_id, v_pkg.nombre,
    'reserva_confirmada', v_payment_status, 'reserva_confirmada',
    CASE WHEN v_amount > 0 THEN 'pendiente' ELSE 'no_aplica' END,
    v_amount, 0, v_amount,
    v_amount, v_currency, v_currency, v_amount,
    v_plan_id, v_plan_nombre, v_snapshot,
    'admin', now()
  ) RETURNING id INTO v_res_id;

  -- Cuotas materializadas en la MISMA transacción
  IF v_plan_id IS NOT NULL THEN
    v_installments := public.materialize_reservation_installments(v_res_id);
    IF v_installments = 0 THEN
      RAISE EXCEPTION 'No se pudieron generar las cuotas del plan "%". Revisá la configuración del plan.', v_plan_nombre;
    END IF;
  END IF;

  INSERT INTO public.reservation_status_history
    (reservation_id, old_reservation_status, new_reservation_status,
     old_payment_status, new_payment_status, changed_by, changed_by_role, note)
  VALUES (v_res_id, NULL, 'reserva_confirmada', NULL, v_payment_status, auth.uid(), 'admin',
          COALESCE(p_note, 'Alta manual desde admin') ||
          CASE WHEN p_package_id IS NOT NULL
               THEN ' · paquete ' || COALESCE(v_pkg.nombre, '?') ||
                    ' · etapa ' || COALESCE(v_stage_nombre, 'precio base') ||
                    ' · precio ' || v_amount::text || ' ' || v_currency ||
                    COALESCE(' · plan ' || v_plan_nombre || ' (' || v_installments::text || ' cuotas)', ' · sin plan de pagos')
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
    'payment_plan_nombre', v_plan_nombre,
    'installments', v_installments
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_event_reservation(uuid, uuid, uuid, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_event_reservation(uuid, uuid, uuid, jsonb, text) TO authenticated, service_role;