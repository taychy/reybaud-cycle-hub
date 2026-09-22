-- Saldo de caja acumulado desde el último arqueo físico.
-- Separa ARS de monedas extranjeras y permite registrar movimientos manuales
-- (retiros, ingresos y ajustes) con trazabilidad.

CREATE TABLE IF NOT EXISTS public.cash_box_manual_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  direction text NOT NULL CHECK (direction IN ('ingreso','egreso')),
  unit text NOT NULL DEFAULT 'general' CHECK (unit IN ('escuela','viajes','tienda','general')),
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'ARS',
  description text NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text
);

ALTER TABLE public.cash_box_manual_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_box_manual_movements_admin_select ON public.cash_box_manual_movements;
CREATE POLICY cash_box_manual_movements_admin_select
ON public.cash_box_manual_movements FOR SELECT
USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS cash_box_manual_movements_admin_insert ON public.cash_box_manual_movements;
CREATE POLICY cash_box_manual_movements_admin_insert
ON public.cash_box_manual_movements FOR INSERT
WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS cash_box_manual_movements_admin_update ON public.cash_box_manual_movements;
CREATE POLICY cash_box_manual_movements_admin_update
ON public.cash_box_manual_movements FOR UPDATE
USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_cash_box_movements(p_hasta date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  movement_date date,
  occurred_at timestamptz,
  direction text,
  unit text,
  origin text,
  ref_id text,
  description text,
  person text,
  amount numeric,
  currency text,
  needs_review boolean,
  note text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH anchor AS (
  SELECT
    c.fecha AS baseline_date,
    COALESCE(c.efectivo_escuela_contado,0)
      + COALESCE(c.efectivo_viajes_contado,0)
      + COALESCE(c.efectivo_tienda_contado,0) AS baseline_amount
  FROM public.cierres_caja_diarios c
  WHERE c.estado='cerrado'
    AND c.fecha <= p_hasta
    AND (
      c.efectivo_escuela_contado IS NOT NULL OR
      c.efectivo_viajes_contado IS NOT NULL OR
      c.efectivo_tienda_contado IS NOT NULL
    )
  ORDER BY c.fecha DESC, c.cerrado_at DESC NULLS LAST
  LIMIT 1
),
baseline AS (
  SELECT
    a.baseline_date AS movement_date,
    (a.baseline_date::timestamp + interval '23 hours 59 minutes')::timestamptz AS occurred_at,
    'baseline'::text AS direction,
    'general'::text AS unit,
    'arqueo'::text AS origin,
    NULL::text AS ref_id,
    'Saldo físico del último cierre'::text AS description,
    NULL::text AS person,
    a.baseline_amount AS amount,
    'ARS'::text AS currency,
    false AS needs_review,
    'Punto de partida confirmado por conteo físico'::text AS note
  FROM anchor a
),
auto_movements AS (
  SELECT
    s.created_at::date,
    s.created_at,
    'ingreso'::text,
    'escuela'::text,
    'suscripcion'::text,
    s.id::text,
    ('Suscripción' || CASE WHEN p.nombre IS NOT NULL THEN ': ' || p.nombre ELSE '' END)::text,
    COALESCE(NULLIF(trim(COALESCE(a.nombre,'') || ' ' || COALESCE(a.apellido,'')),''),a.email,'Alumno')::text,
    COALESCE(s.precio_final,0)::numeric,
    'ARS'::text,
    false,
    NULL::text
  FROM public.suscripciones s
  LEFT JOIN public.alumnos a ON a.id=s.alumno_id
  LEFT JOIN public.planes p ON p.id=s.plan_id
  CROSS JOIN anchor x
  WHERE s.metodo_pago='efectivo'
    AND s.estado IN ('activa','finalizada','conciliado')
    AND s.created_at::date > x.baseline_date
    AND s.created_at::date <= p_hasta
    AND COALESCE(s.precio_final,0) > 0

  UNION ALL

  SELECT
    rp.payment_date::date,
    rp.payment_date,
    'ingreso','viajes','reserva',rp.id::text,
    'Pago de reserva / evento',
    COALESCE(NULLIF(trim(COALESCE(a.nombre,'') || ' ' || COALESCE(a.apellido,'')),''),a.email,'Alumno'),
    rp.amount,COALESCE(rp.currency,'ARS'),false,NULL::text
  FROM public.reservation_payments rp
  LEFT JOIN public.alumnos a ON a.id=rp.alumno_id
  CROSS JOIN anchor x
  WHERE rp.payment_method='efectivo'
    AND rp.status='validado'
    AND rp.anulado_at IS NULL
    AND rp.payment_date::date > x.baseline_date
    AND rp.payment_date::date <= p_hasta

  UNION ALL

  SELECT
    o.pagado_at::date,o.pagado_at,'ingreso','tienda','tienda',o.id::text,
    ('Orden ' || COALESCE(o.order_number::text,'')),
    COALESCE(o.customer_name,NULLIF(trim(COALESCE(a.nombre,'') || ' ' || COALESCE(a.apellido,'')),''),o.customer_email,'Cliente'),
    o.total,COALESCE(o.currency,'ARS'),
    (lower(COALESCE(o.customer_name,'')) LIKE '%test%' OR lower(COALESCE(o.customer_email,'')) LIKE '%test%'),
    CASE
      WHEN lower(COALESCE(o.customer_name,'')) LIKE '%test%'
        OR lower(COALESCE(o.customer_email,'')) LIKE '%test%'
      THEN 'Movimiento con datos de prueba: revisar si corresponde a caja real'
      ELSE NULL
    END
  FROM public.store_orders o
  LEFT JOIN public.alumnos a ON a.id=o.alumno_id
  CROSS JOIN anchor x
  WHERE o.metodo_pago='efectivo'
    AND o.cancelled_at IS NULL
    AND COALESCE(o.status,'') NOT IN ('cancelado','cancelada')
    AND o.pagado_at IS NOT NULL
    AND o.pagado_at::date > x.baseline_date
    AND o.pagado_at::date <= p_hasta

  UNION ALL

  SELECT
    gep.fecha,gep.created_at,'egreso',
    COALESCE(NULLIF(g.unidad_negocio,''),'general'),'gasto',gep.id::text,
    COALESCE(g.descripcion,'Pago de gasto'),COALESCE(g.proveedor,''),
    gep.monto,'ARS',false,gep.notas
  FROM public.gastos_ejecucion_pagos gep
  LEFT JOIN public.gastos g ON g.id=gep.gasto_id
  CROSS JOIN anchor x
  WHERE lower(COALESCE(gep.forma_pago,''))='efectivo'
    AND gep.fecha > x.baseline_date
    AND gep.fecha <= p_hasta

  UNION ALL

  SELECT
    g.fecha,g.created_at,'egreso',
    COALESCE(NULLIF(g.unidad_negocio,''),'general'),'gasto',g.id::text,
    COALESCE(g.descripcion,'Gasto en efectivo'),COALESCE(g.proveedor,''),
    g.monto,COALESCE(g.moneda,'ARS'),false,g.notas
  FROM public.gastos g
  CROSS JOIN anchor x
  WHERE lower(COALESCE(g.forma_pago,''))='efectivo'
    AND g.fecha > x.baseline_date
    AND g.fecha <= p_hasta
    AND NOT EXISTS (
      SELECT 1 FROM public.gastos_ejecucion_pagos gep WHERE gep.gasto_id=g.id
    )

  UNION ALL

  SELECT
    dsp.fecha,dsp.created_at,'egreso','tienda','proveedor_tienda',dsp.id::text,
    COALESCE(dsp.concepto,'Pago proveedor tienda'),COALESCE(dsp.registrado_por_nombre,''),
    dsp.monto,COALESCE(dsp.moneda,'ARS'),false,dsp.notas
  FROM public.delivery_supplier_payments dsp
  CROSS JOIN anchor x
  WHERE lower(COALESCE(dsp.metodo,''))='efectivo'
    AND dsp.fecha > x.baseline_date
    AND dsp.fecha <= p_hasta

  UNION ALL

  SELECT
    d.fecha,d.created_at,'egreso',
    CASE
      WHEN d.store_order_id IS NOT NULL THEN 'tienda'
      WHEN d.reservation_id IS NOT NULL THEN 'viajes'
      WHEN d.suscripcion_id IS NOT NULL THEN 'escuela'
      ELSE 'general'
    END,
    'devolucion',d.id::text,COALESCE(d.motivo,'Devolución en efectivo'),
    COALESCE(NULLIF(trim(COALESCE(a.nombre,'') || ' ' || COALESCE(a.apellido,'')),''),''),
    d.monto,COALESCE(d.moneda,'ARS'),false,d.notas
  FROM public.devoluciones d
  LEFT JOIN public.alumnos a ON a.id=d.alumno_id
  CROSS JOIN anchor x
  WHERE lower(COALESCE(d.metodo,''))='efectivo'
    AND d.fecha > x.baseline_date
    AND d.fecha <= p_hasta

  UNION ALL

  SELECT
    m.occurred_at::date,m.occurred_at,m.direction,m.unit,'manual',m.id::text,
    m.description,NULL::text,m.amount,m.currency,false,m.notes
  FROM public.cash_box_manual_movements m
  CROSS JOIN anchor x
  WHERE m.voided_at IS NULL
    AND m.occurred_at::date > x.baseline_date
    AND m.occurred_at::date <= p_hasta
)
SELECT * FROM baseline
UNION ALL
SELECT * FROM auto_movements
ORDER BY occurred_at ASC, origin ASC;
$function$;

CREATE OR REPLACE FUNCTION public.get_cash_box_balance(p_hasta date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  baseline_date date,
  baseline_amount numeric,
  ingresos numeric,
  egresos numeric,
  expected_amount numeric,
  movements_count integer,
  review_count integer,
  review_amount numeric,
  other_currencies jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH m AS (
  SELECT * FROM public.get_cash_box_movements(p_hasta)
),
b AS (
  SELECT movement_date AS baseline_date, amount AS baseline_amount
  FROM m WHERE direction='baseline' AND currency='ARS' LIMIT 1
),
fx AS (
  SELECT COALESCE(
    jsonb_object_agg(currency, jsonb_build_object(
      'ingresos', ingresos,
      'egresos', egresos,
      'neto', ingresos-egresos,
      'movimientos', movimientos
    )),
    '{}'::jsonb
  ) AS data
  FROM (
    SELECT
      currency,
      COALESCE(SUM(amount) FILTER (WHERE direction='ingreso'),0) ingresos,
      COALESCE(SUM(amount) FILTER (WHERE direction='egreso'),0) egresos,
      COUNT(*) FILTER (WHERE direction IN ('ingreso','egreso'))::int movimientos
    FROM m
    WHERE currency <> 'ARS'
    GROUP BY currency
  ) q
)
SELECT
  b.baseline_date,
  COALESCE(b.baseline_amount,0),
  COALESCE(SUM(m.amount) FILTER (WHERE m.direction='ingreso' AND m.currency='ARS'),0),
  COALESCE(SUM(m.amount) FILTER (WHERE m.direction='egreso' AND m.currency='ARS'),0),
  COALESCE(b.baseline_amount,0)
    + COALESCE(SUM(m.amount) FILTER (WHERE m.direction='ingreso' AND m.currency='ARS'),0)
    - COALESCE(SUM(m.amount) FILTER (WHERE m.direction='egreso' AND m.currency='ARS'),0),
  COUNT(*) FILTER (WHERE m.direction IN ('ingreso','egreso') AND m.currency='ARS')::int,
  COUNT(*) FILTER (WHERE m.needs_review AND m.currency='ARS')::int,
  COALESCE(SUM(m.amount) FILTER (WHERE m.needs_review AND m.currency='ARS'),0),
  fx.data
FROM m
LEFT JOIN b ON true
CROSS JOIN fx
GROUP BY b.baseline_date,b.baseline_amount,fx.data;
$function$;

CREATE OR REPLACE FUNCTION public.register_cash_box_manual_movement(
  p_direction text,
  p_unit text,
  p_amount numeric,
  p_description text,
  p_notes text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now(),
  p_currency text DEFAULT 'ARS'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_currency text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo un admin puede registrar movimientos de caja';
  END IF;

  IF p_direction NOT IN ('ingreso','egreso') THEN RAISE EXCEPTION 'Dirección inválida'; END IF;
  IF p_unit NOT IN ('escuela','viajes','tienda','general') THEN RAISE EXCEPTION 'Unidad inválida'; END IF;
  IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a cero'; END IF;
  IF NULLIF(trim(COALESCE(p_description,'')),'') IS NULL THEN RAISE EXCEPTION 'El concepto es obligatorio'; END IF;

  v_currency := upper(COALESCE(NULLIF(trim(p_currency),''),'ARS'));
  IF v_currency NOT IN ('ARS','USD','EUR') THEN RAISE EXCEPTION 'Moneda no soportada'; END IF;

  INSERT INTO public.cash_box_manual_movements(
    occurred_at,direction,unit,amount,currency,description,notes,created_by
  )
  VALUES(
    COALESCE(p_occurred_at,now()),p_direction,p_unit,p_amount,v_currency,
    trim(p_description),NULLIF(trim(COALESCE(p_notes,'')),''),auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
