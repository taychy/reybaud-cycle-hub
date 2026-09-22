-- Vincular salidas reales de la cuenta MP Viajes/Eventos con gastos de un evento.
-- Los egresos se sincronizan desde mp_account_movements y requieren asociación
-- explícita para evitar imputar impuestos/otros viajes al evento equivocado.

CREATE OR REPLACE FUNCTION public.get_event_mp_viajes_outflows(p_event_id uuid)
RETURNS TABLE(
  movement_id uuid,
  mp_payment_id text,
  amount numeric,
  currency text,
  description text,
  external_reference text,
  fecha_movimiento timestamptz,
  cuenta_mp_id uuid,
  cuenta_nombre text,
  gasto_id uuid,
  gasto_event_id uuid,
  estado_asociacion text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH ev AS (
  SELECT e.id, e.created_at, e.end_date
  FROM public.events e
  WHERE e.id = p_event_id
),
travel_accounts AS (
  SELECT DISTINCT r.cuenta_mp_id
  FROM public.cuenta_mp_routing r
  WHERE r.activa = true
    AND r.unidad_negocio::text IN ('viaje_camp','evento')
)
SELECT
  m.id,
  m.mp_payment_id,
  m.amount,
  m.currency,
  m.description,
  m.external_reference,
  m.fecha_movimiento,
  m.cuenta_mp_id,
  c.nombre,
  m.gasto_id,
  g.event_id,
  CASE
    WHEN m.gasto_id IS NULL THEN 'pendiente'
    WHEN g.event_id = p_event_id THEN 'asociado_evento'
    WHEN g.event_id IS NULL THEN 'gasto_sin_evento'
    ELSE 'otro_evento'
  END
FROM public.mp_account_movements m
JOIN travel_accounts ta ON ta.cuenta_mp_id = m.cuenta_mp_id
JOIN public.cuentas_mp c ON c.id = m.cuenta_mp_id
CROSS JOIN ev
LEFT JOIN public.gastos g ON g.id = m.gasto_id
WHERE m.direccion = 'egreso'
  AND m.status = 'approved'
  AND m.amount > 0
  AND m.fecha_movimiento >= (ev.created_at - interval '30 days')
  AND m.fecha_movimiento < (COALESCE(ev.end_date, CURRENT_DATE)::timestamp + interval '31 days')
ORDER BY m.fecha_movimiento DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_viajes_mp_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.cuenta_mp_id
  FROM public.cuenta_mp_routing r
  JOIN public.cuentas_mp c ON c.id = r.cuenta_mp_id
  WHERE r.activa = true
    AND c.activa = true
    AND r.unidad_negocio::text IN ('viaje_camp','evento')
  ORDER BY CASE WHEN r.unidad_negocio::text='viaje_camp' THEN 0 ELSE 1 END,
           r.prioridad ASC,
           c.created_at ASC
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.link_mp_viajes_outflow_to_event(
  p_movement_id uuid,
  p_event_id uuid,
  p_categoria text DEFAULT 'Otros',
  p_descripcion text DEFAULT NULL,
  p_proveedor text DEFAULT NULL,
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m public.mp_account_movements%ROWTYPE;
  v_gasto public.gastos%ROWTYPE;
  v_gasto_id uuid;
  v_is_travel_account boolean;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo un admin puede asociar salidas MP a eventos';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id=p_event_id) THEN
    RAISE EXCEPTION 'Evento no encontrado';
  END IF;

  SELECT * INTO m
  FROM public.mp_account_movements
  WHERE id=p_movement_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento MP no encontrado'; END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.cuenta_mp_routing r
    WHERE r.cuenta_mp_id=m.cuenta_mp_id
      AND r.activa=true
      AND r.unidad_negocio::text IN ('viaje_camp','evento')
  ) INTO v_is_travel_account;

  IF NOT v_is_travel_account THEN
    RAISE EXCEPTION 'El movimiento no pertenece a la cuenta MP de Viajes/Eventos';
  END IF;

  IF m.direccion <> 'egreso' OR COALESCE(m.status,'') <> 'approved' THEN
    RAISE EXCEPTION 'Sólo se pueden asociar egresos MP aprobados';
  END IF;

  IF m.gasto_id IS NOT NULL THEN
    SELECT * INTO v_gasto FROM public.gastos WHERE id=m.gasto_id FOR UPDATE;
    IF FOUND THEN
      IF v_gasto.event_id IS NOT NULL AND v_gasto.event_id <> p_event_id THEN
        RAISE EXCEPTION 'Este egreso ya está asociado a otro evento';
      END IF;

      UPDATE public.gastos
      SET event_id=p_event_id, unidad_negocio='viajes', updated_at=now()
      WHERE id=v_gasto.id;

      UPDATE public.mp_account_movements
      SET categorizado_at=COALESCE(categorizado_at,now()),
          categorizado_por=COALESCE(categorizado_por,auth.uid())
      WHERE id=m.id;

      RETURN v_gasto.id;
    END IF;
  END IF;

  SELECT * INTO v_gasto
  FROM public.gastos
  WHERE mp_payment_id=m.mp_payment_id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_gasto.event_id IS NOT NULL AND v_gasto.event_id <> p_event_id THEN
      RAISE EXCEPTION 'Ya existe un gasto de este pago asociado a otro evento';
    END IF;

    UPDATE public.gastos
    SET event_id=p_event_id, unidad_negocio='viajes', updated_at=now()
    WHERE id=v_gasto.id;

    UPDATE public.mp_account_movements
    SET gasto_id=v_gasto.id, categorizado_at=now(), categorizado_por=auth.uid()
    WHERE id=m.id;

    RETURN v_gasto.id;
  END IF;

  INSERT INTO public.gastos(
    categoria, descripcion, monto, moneda, fecha, proveedor, notas,
    registrado_por, forma_pago, mp_payment_id, mp_status,
    mp_external_reference, origen_registro, estado_conciliacion,
    event_id, unidad_negocio
  )
  VALUES(
    COALESCE(NULLIF(trim(p_categoria),''),'Otros'),
    COALESCE(NULLIF(trim(p_descripcion),''),NULLIF(trim(COALESCE(m.description,'')),''),
             'Egreso MP Viajes ' || m.mp_payment_id),
    m.amount,
    COALESCE(m.currency,'ARS'),
    (m.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
    NULLIF(trim(COALESCE(p_proveedor,'')),''),
    NULLIF(trim(COALESCE(p_notas,'')),''),
    auth.uid(),
    'mp_scarlett_viajes',
    m.mp_payment_id,
    m.status,
    m.external_reference,
    'mp_event_sync',
    'conciliado',
    p_event_id,
    'viajes'
  )
  RETURNING id INTO v_gasto_id;

  UPDATE public.mp_account_movements
  SET gasto_id=v_gasto_id, categorizado_at=now(), categorizado_por=auth.uid()
  WHERE id=m.id;

  RETURN v_gasto_id;
END;
$function$;
