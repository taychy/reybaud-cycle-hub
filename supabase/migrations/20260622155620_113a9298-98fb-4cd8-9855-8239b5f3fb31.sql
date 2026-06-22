
-- =============================================================================
-- 1) RPC: start_pausa_alumno
--    Cancela todas las suscripciones operativas y de pausa legacy del alumno
--    e inserta una nueva suscripción de categoría 'pausa' en una sola transacción.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.start_pausa_alumno(
  p_alumno_id uuid,
  p_fecha_regreso date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pausa_plan_id uuid;
  v_pausa_precio numeric;
  v_today date := current_date;
  v_actor uuid := auth.uid();
BEGIN
  -- Autorización: admin, coach, super admin o el propio alumno
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT (
    public.has_role(v_actor, 'admin'::app_role)
    OR public.has_role(v_actor, 'coach'::app_role)
    OR public.is_super_admin(v_actor)
    OR EXISTS (SELECT 1 FROM public.alumnos a WHERE a.id = p_alumno_id AND a.user_id = v_actor)
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_fecha_regreso IS NULL OR p_fecha_regreso <= v_today THEN
    RAISE EXCEPTION 'Fecha de regreso inválida (debe ser futura)';
  END IF;
  IF (p_fecha_regreso - v_today) > 62 THEN
    RAISE EXCEPTION 'PAUSA_TOO_LONG: La pausa no puede durar más de 2 meses.';
  END IF;

  -- Plan de pausa activo
  SELECT id, COALESCE(precio, 0)
    INTO v_pausa_plan_id, v_pausa_precio
  FROM public.planes
  WHERE categoria = 'pausa' AND activo IS NOT FALSE
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_pausa_plan_id IS NULL THEN
    RAISE EXCEPTION 'No hay plan de categoría "pausa" configurado.';
  END IF;

  -- Cancelar todas las suscripciones vigentes (incluye estado=''pausa'' legacy)
  -- Mantenemos fecha_fin original para preservar acceso restante donde aplique.
  UPDATE public.suscripciones
  SET cancelada_at = now(),
      estado = CASE
        WHEN estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','pausa')
          THEN 'cancelada'
        ELSE estado
      END
  WHERE alumno_id = p_alumno_id
    AND cancelada_at IS NULL
    AND estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','pausa');

  -- Insertar la pausa (los triggers existentes validan duplicados de pausa)
  INSERT INTO public.suscripciones (
    alumno_id, plan_id, estado, fecha_inicio, fecha_fin,
    mp_status, metodo_pago, origen_registro, precio_base, precio_final
  ) VALUES (
    p_alumno_id, v_pausa_plan_id, 'activa', v_today, p_fecha_regreso,
    'manual', 'efectivo', 'cargado_admin', v_pausa_precio, v_pausa_precio
  );

  RETURN jsonb_build_object('ok', true, 'fecha_regreso', p_fecha_regreso);
END;
$$;

REVOKE ALL ON FUNCTION public.start_pausa_alumno(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_pausa_alumno(uuid, date) TO authenticated, service_role;


-- =============================================================================
-- 2) get_cuenta_publica: usar saldo NETO para no listar items ya pagados.
--    - Subs: restar suma de "haber" registrada en vw_cuenta_corriente_movimientos
--    - Cuotas de evento: usar balance_due (ya neteado)
--    - Tienda y Preventas: restar pagos contabilizados
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_cuenta_publica(p_token uuid, p_user_agent text DEFAULT NULL::text, p_ip text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  WITH
  -- Pagos ya contabilizados por fuente
  pagos AS (
    SELECT fuente_tabla, fuente_id, SUM(haber)::numeric AS pagado
    FROM public.vw_cuenta_corriente_movimientos
    WHERE alumno_id = v_token_row.alumno_id
      AND haber > 0
    GROUP BY fuente_tabla, fuente_id
  ),
  subs AS (
    SELECT
      'suscripcion'::text AS tipo,
      s.id::text AS ref_id,
      COALESCE(p.nombre, 'Plan') ||
        CASE WHEN s.fecha_inicio IS NOT NULL THEN ' — ' || to_char(s.fecha_inicio, 'TMMonth YYYY') ELSE '' END AS concepto,
      s.fecha_fin AS due_date,
      COALESCE(s.precio_final, s.precio_base, 0)::numeric AS total,
      COALESCE(pg.pagado, 0)::numeric AS pagado,
      (COALESCE(s.precio_final, s.precio_base, 0) - COALESCE(pg.pagado, 0))::numeric AS por_pagar,
      COALESCE(p.moneda, 'ARS') AS moneda,
      s.estado AS estado,
      true AS mp_disponible,
      jsonb_build_object('plan_id', s.plan_id, 'alumno_id', s.alumno_id, 'suscripcion_id', s.id) AS payment_payload
    FROM public.suscripciones s
    JOIN public.planes p ON p.id = s.plan_id
    LEFT JOIN pagos pg ON pg.fuente_tabla = 'suscripciones' AND pg.fuente_id = s.id
    WHERE s.alumno_id = v_token_row.alumno_id
      AND s.cancelada_at IS NULL
      AND s.estado IN ('vencida','pendiente_verificacion','pago_pendiente','pendiente','acceso_pausado')
      AND (COALESCE(s.precio_final, s.precio_base, 0) - COALESCE(pg.pagado, 0)) > 0.01
  ),
  cuotas AS (
    SELECT
      'evento_cuota'::text AS tipo,
      ri.id::text AS ref_id,
      COALESCE(e.title, 'Evento') || ' — ' || ri.label AS concepto,
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
      AND ri.balance_due > 0.01
      AND er.estado <> 'cancelada'
  ),
  ordenes AS (
    SELECT
      'tienda'::text AS tipo,
      so.id::text AS ref_id,
      'Pedido tienda #' || so.order_number AS concepto,
      so.created_at::date AS due_date,
      so.total::numeric AS total,
      COALESCE(pg.pagado, 0)::numeric AS pagado,
      (so.total - COALESCE(pg.pagado, 0))::numeric AS por_pagar,
      so.currency AS moneda,
      so.status AS estado,
      true AS mp_disponible,
      jsonb_build_object('order_id', so.id) AS payment_payload
    FROM public.store_orders so
    LEFT JOIN pagos pg ON pg.fuente_tabla = 'store_orders' AND pg.fuente_id = so.id
    WHERE so.alumno_id = v_token_row.alumno_id
      AND so.status IN ('pendiente_pago','pendiente_verificacion')
      AND (so.total - COALESCE(pg.pagado, 0)) > 0.01
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
      AND sp.saldo_pendiente > 0.01
  ),
  todas AS (
    SELECT * FROM subs
    UNION ALL SELECT * FROM cuotas
    UNION ALL SELECT * FROM ordenes
    UNION ALL SELECT * FROM preventas
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.due_date NULLS LAST), '[]'::jsonb)
  INTO v_deudas FROM todas t;

  WITH saldos AS (
    SELECT
      m.moneda,
      (COALESCE(SUM(m.debe), 0) - COALESCE(SUM(m.haber), 0))::numeric AS saldo
    FROM public.vw_cuenta_corriente_movimientos m
    WHERE m.alumno_id = v_token_row.alumno_id
    GROUP BY m.moneda
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('moneda', moneda, 'monto', abs(saldo))), '[]'::jsonb)
  INTO v_creditos FROM saldos WHERE saldo < -0.01;

  RETURN jsonb_build_object(
    'valid', true,
    'saludo', v_saludo,
    'deudas', COALESCE(v_deudas, '[]'::jsonb),
    'creditos', COALESCE(v_creditos, '[]'::jsonb)
  );
END;
$function$;
