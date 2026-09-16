CREATE UNIQUE INDEX IF NOT EXISTS reservation_addons_reservation_addon_uidx
ON public.reservation_addons (reservation_id, addon_id);

CREATE OR REPLACE FUNCTION public.manage_trip_extras_by_token(
  p_token text,
  p_action text DEFAULT 'get',
  p_selections jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res public.event_reservations%ROWTYPE;
  v_item jsonb;
  v_addon_id uuid;
  v_addon public.event_addons%ROWTYPE;
  v_existing public.reservation_addons%ROWTYPE;
  v_qty integer;
  v_timing text;
  v_raw_qty text;
  v_used integer;
  v_addons jsonb;
  v_contracted jsonb;
  v_selected jsonb;
  v_pending boolean;
  v_refreshed jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~* '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  SELECT * INTO v_res
  FROM public.event_reservations
  WHERE access_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ea.id,
      'event_id', ea.event_id,
      'nombre', ea.nombre,
      'descripcion', ea.descripcion,
      'precio', ea.precio,
      'currency', ea.currency,
      'tipo', ea.tipo,
      'max_por_participante', ea.max_por_participante,
      'stock_total', ea.stock_total,
      'activo', ea.activo,
      'sort_order', ea.sort_order,
      'created_at', ea.created_at
    ) ORDER BY ea.sort_order, ea.created_at
  ), '[]'::jsonb)
  INTO v_addons
  FROM public.event_addons ea
  WHERE ea.event_id = v_res.event_id
    AND ea.activo = true;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ra.id,
      'reservation_id', ra.reservation_id,
      'addon_id', ra.addon_id,
      'cantidad', ra.cantidad,
      'precio_unitario', ra.precio_unitario,
      'subtotal', ra.subtotal,
      'currency', ra.currency,
      'notas', ra.notas,
      'noche_timing', ra.noche_timing,
      'created_at', ra.created_at
    ) ORDER BY ra.created_at
  ), '[]'::jsonb)
  INTO v_contracted
  FROM public.reservation_addons ra
  WHERE ra.reservation_id = v_res.id;

  IF COALESCE(p_action, 'get') = 'get' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'event_id', v_res.event_id,
      'reservation_status', v_res.reservation_status,
      'addons', v_addons,
      'contracted', v_contracted
    );
  END IF;

  IF p_action <> 'save' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  IF v_res.reservation_status IN ('cancelada', 'rechazada') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reservation_not_editable');
  END IF;

  IF p_selections IS NULL OR jsonb_typeof(p_selections) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_selections');
  END IF;

  IF jsonb_array_length(p_selections) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_selections');
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_selections)
  LOOP
    IF COALESCE(v_item->>'addon_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_addon_id');
    END IF;

    v_addon_id := (v_item->>'addon_id')::uuid;

    SELECT * INTO v_addon
    FROM public.event_addons
    WHERE id = v_addon_id
      AND event_id = v_res.event_id
      AND activo = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'addon_not_available', 'addon_id', v_addon_id);
    END IF;

    SELECT * INTO v_existing
    FROM public.reservation_addons
    WHERE reservation_id = v_res.id
      AND addon_id = v_addon_id
    LIMIT 1;

    IF v_addon.nombre ~* 'noche[s]?\s+extra' THEN
      v_timing := NULLIF(v_item->>'noche_timing', '');

      IF v_timing IS NOT NULL THEN
        IF v_timing NOT IN ('antes', 'despues', 'ambas') THEN
          RETURN jsonb_build_object('ok', false, 'error', 'invalid_night_timing', 'addon_id', v_addon_id);
        END IF;
        v_qty := CASE WHEN v_timing = 'ambas' THEN 2 ELSE 1 END;
      ELSE
        -- Las compras históricas sin timing se conservan hasta que el participante
        -- indique si la noche es antes, después o ambas.
        IF v_existing.id IS NOT NULL
           AND v_existing.cantidad > 0
           AND v_existing.noche_timing IS NULL THEN
          CONTINUE;
        END IF;

        v_raw_qty := COALESCE(v_item->>'cantidad', '0');
        IF v_raw_qty !~ '^\d+$' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'invalid_quantity', 'addon_id', v_addon_id);
        END IF;
        v_qty := v_raw_qty::integer;
        IF v_qty > 0 THEN
          RETURN jsonb_build_object('ok', false, 'error', 'invalid_night_timing', 'addon_id', v_addon_id);
        END IF;
        v_qty := 0;
      END IF;
    ELSE
      v_timing := NULL;
      v_raw_qty := COALESCE(v_item->>'cantidad', '0');
      IF v_raw_qty !~ '^\d+$' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_quantity', 'addon_id', v_addon_id);
      END IF;
      v_qty := v_raw_qty::integer;

      IF COALESCE(v_addon.max_por_participante, 0) > 0
         AND v_qty > v_addon.max_por_participante THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'max_exceeded',
          'addon_id', v_addon_id,
          'max', v_addon.max_por_participante
        );
      END IF;
    END IF;

    SELECT COALESCE(SUM(ra.cantidad), 0)::integer
    INTO v_used
    FROM public.reservation_addons ra
    WHERE ra.addon_id = v_addon_id
      AND ra.reservation_id <> v_res.id;

    IF v_addon.stock_total IS NOT NULL
       AND v_addon.stock_total >= 0
       AND v_used + v_qty > v_addon.stock_total THEN
      RETURN jsonb_build_object('ok', false, 'error', 'stock_exceeded', 'addon_id', v_addon_id);
    END IF;

    IF v_existing.id IS NOT NULL AND v_qty <= 0 THEN
      DELETE FROM public.reservation_addons
      WHERE id = v_existing.id;
    ELSIF v_existing.id IS NOT NULL AND v_qty > 0 THEN
      UPDATE public.reservation_addons
      SET cantidad = v_qty,
          precio_unitario = v_addon.precio,
          currency = v_addon.currency,
          noche_timing = v_timing,
          updated_at = now()
      WHERE id = v_existing.id;
    ELSIF v_existing.id IS NULL AND v_qty > 0 THEN
      INSERT INTO public.reservation_addons (
        reservation_id,
        addon_id,
        cantidad,
        precio_unitario,
        currency,
        noche_timing
      ) VALUES (
        v_res.id,
        v_addon_id,
        v_qty,
        v_addon.precio,
        v_addon.currency,
        v_timing
      );
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ra.id,
      'reservation_id', ra.reservation_id,
      'addon_id', ra.addon_id,
      'cantidad', ra.cantidad,
      'precio_unitario', ra.precio_unitario,
      'subtotal', ra.subtotal,
      'currency', ra.currency,
      'notas', ra.notas,
      'noche_timing', ra.noche_timing,
      'created_at', ra.created_at
    ) ORDER BY ra.created_at
  ), '[]'::jsonb)
  INTO v_contracted
  FROM public.reservation_addons ra
  WHERE ra.reservation_id = v_res.id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'addon_id', ra.addon_id,
      'nombre', ea.nombre,
      'cantidad', ra.cantidad,
      'precio_unitario', ra.precio_unitario,
      'currency', ra.currency,
      'noche_timing', ra.noche_timing
    ) ORDER BY ra.created_at
  ), '[]'::jsonb)
  INTO v_selected
  FROM public.reservation_addons ra
  JOIN public.event_addons ea ON ea.id = ra.addon_id
  WHERE ra.reservation_id = v_res.id;

  SELECT EXISTS (
    SELECT 1
    FROM public.reservation_addons ra
    JOIN public.event_addons ea ON ea.id = ra.addon_id
    WHERE ra.reservation_id = v_res.id
      AND ra.cantidad > 0
      AND ra.noche_timing IS NULL
      AND ea.nombre ~* 'noche[s]?\s+extra'
  ) INTO v_pending;

  INSERT INTO public.reservation_checklist_data (
    reservation_id,
    alumno_id,
    step_key,
    completed,
    needs_advice,
    data,
    file_url
  ) VALUES (
    v_res.id,
    v_res.alumno_id,
    'extras',
    NOT v_pending,
    false,
    jsonb_build_object(
      'selected', v_selected,
      'declined', jsonb_array_length(v_selected) = 0,
      'pending_night_timing', v_pending,
      'updated_at', now()
    ),
    NULL
  )
  ON CONFLICT (reservation_id, step_key)
  DO UPDATE SET
    alumno_id = EXCLUDED.alumno_id,
    completed = EXCLUDED.completed,
    needs_advice = EXCLUDED.needs_advice,
    data = EXCLUDED.data,
    file_url = EXCLUDED.file_url,
    updated_at = now();

  SELECT jsonb_build_object(
    'amount_total', er.amount_total,
    'amount_paid', er.amount_paid,
    'balance_due', er.balance_due,
    'moneda', er.moneda,
    'currency_snapshot', er.currency_snapshot
  )
  INTO v_refreshed
  FROM public.event_reservations er
  WHERE er.id = v_res.id;

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', v_res.event_id,
    'reservation_status', v_res.reservation_status,
    'addons', v_addons,
    'contracted', v_contracted,
    'reservation', v_refreshed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manage_trip_extras_by_token(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_trip_extras_by_token(text, text, jsonb) TO anon, authenticated, service_role;
