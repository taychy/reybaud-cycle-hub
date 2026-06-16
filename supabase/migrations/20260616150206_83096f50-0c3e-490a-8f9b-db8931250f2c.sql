
CREATE OR REPLACE FUNCTION public.get_cuenta_publica(
  p_token uuid,
  p_user_agent text DEFAULT NULL,
  p_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_row public.cuenta_corriente_tokens%ROWTYPE;
  v_alumno record;
  v_saludo text;
  v_deudas jsonb;
  v_creditos jsonb;
BEGIN
  SELECT * INTO v_token_row FROM public.cuenta_corriente_tokens WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid', false, 'reason', 'not_found'); END IF;
  IF v_token_row.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('valid', false, 'reason', 'revoked'); END IF;
  IF v_token_row.expires_at IS NOT NULL AND v_token_row.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  UPDATE public.cuenta_corriente_tokens
  SET last_accessed_at = now(),
      access_count = access_count + 1,
      last_user_agent = COALESCE(p_user_agent, last_user_agent),
      last_ip = COALESCE(p_ip, last_ip)
  WHERE id = v_token_row.id;

  SELECT nombre, apellido INTO v_alumno FROM public.alumnos WHERE id = v_token_row.alumno_id;
  v_saludo := COALESCE(v_alumno.nombre, '') ||
              CASE WHEN v_alumno.apellido IS NOT NULL AND length(v_alumno.apellido) > 0
                   THEN ' ' || upper(left(v_alumno.apellido, 1)) || '.'
                   ELSE '' END;

  WITH subs AS (
    SELECT
      'suscripcion'::text AS tipo,
      s.id::text AS ref_id,
      COALESCE(p.nombre, 'Plan') ||
        CASE WHEN s.fecha_inicio IS NOT NULL THEN ' — ' || to_char(s.fecha_inicio, 'TMMonth YYYY') ELSE '' END AS concepto,
      s.fecha_fin AS due_date,
      COALESCE(s.precio_final, s.precio_base, 0)::numeric AS total,
      0::numeric AS pagado,
      COALESCE(s.precio_final, s.precio_base, 0)::numeric AS por_pagar,
      COALESCE(p.moneda, 'ARS') AS moneda,
      s.estado AS estado,
      true AS mp_disponible,
      jsonb_build_object('plan_id', s.plan_id, 'alumno_id', s.alumno_id, 'suscripcion_id', s.id) AS payment_payload
    FROM public.suscripciones s
    JOIN public.planes p ON p.id = s.plan_id
    WHERE s.alumno_id = v_token_row.alumno_id
      AND s.cancelada_at IS NULL
      AND s.estado IN ('vencida','pendiente_verificacion','pago_pendiente','pendiente')
      AND COALESCE(s.precio_final, s.precio_base, 0) > 0
  ),
  cuotas AS (
    SELECT
      'evento_cuota'::text AS tipo,
      ri.id::text AS ref_id,
      COALESCE(e.titulo, 'Evento') || ' — ' || ri.label AS concepto,
      ri.due_date AS due_date,
      ri.amount::numeric AS total,
      ri.paid_amount::numeric AS pagado,
      ri.balance_due::numeric AS por_pagar,
      ri.currency AS moneda,
      ri.status AS estado,
      true AS mp_disponible,
      jsonb_build_object('reservation_id', ri.reservation_id, 'amount', ri.balance_due) AS payment_payload
    FROM public.reservation_installments ri
    JOIN public.event_reservations er ON er.id = ri.reservation_id
    JOIN public.events e ON e.id = er.event_id
    WHERE er.alumno_id = v_token_row.alumno_id
      AND ri.condoned_at IS NULL
      AND ri.status IN ('pendiente','parcial','vencida')
      AND ri.balance_due > 0
      AND er.estado <> 'cancelada'
  ),
  ordenes AS (
    SELECT
      'tienda'::text AS tipo,
      so.id::text AS ref_id,
      'Pedido tienda #' || so.order_number AS concepto,
      so.created_at::date AS due_date,
      so.total::numeric AS total,
      0::numeric AS pagado,
      so.total::numeric AS por_pagar,
      so.currency AS moneda,
      so.status AS estado,
      true AS mp_disponible,
      jsonb_build_object('order_id', so.id) AS payment_payload
    FROM public.store_orders so
    WHERE so.alumno_id = v_token_row.alumno_id
      AND so.status = 'pendiente_pago'
      AND so.total > 0
  ),
  preventas AS (
    SELECT
      'preventa'::text AS tipo,
      sp.id::text AS ref_id,
      'Preventa: ' || sp.producto_nombre AS concepto,
      sp.created_at::date AS due_date,
      sp.precio_total::numeric AS total,
      (sp.precio_total - sp.saldo_pendiente)::numeric AS pagado,
      sp.saldo_pendiente::numeric AS por_pagar,
      sp.moneda AS moneda,
      sp.estado AS estado,
      true AS mp_disponible,
      jsonb_build_object('preorder_id', sp.id) AS payment_payload
    FROM public.store_preorders sp
    WHERE sp.alumno_id = v_token_row.alumno_id
      AND sp.cancelada_at IS NULL
      AND sp.estado NOT IN ('cancelada','entregada')
      AND sp.saldo_pendiente > 0
  ),
  todas AS (
    SELECT * FROM subs
    UNION ALL SELECT * FROM cuotas
    UNION ALL SELECT * FROM ordenes
    UNION ALL SELECT * FROM preventas
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.due_date NULLS LAST), '[]'::jsonb)
  INTO v_deudas FROM todas t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('moneda', moneda, 'monto', abs(saldo))), '[]'::jsonb)
  INTO v_creditos FROM public.get_saldo_alumno(v_token_row.alumno_id) WHERE saldo < -0.01;

  RETURN jsonb_build_object(
    'valid', true,
    'saludo', v_saludo,
    'deudas', COALESCE(v_deudas, '[]'::jsonb),
    'creditos', COALESCE(v_creditos, '[]'::jsonb)
  );
END;
$$;
