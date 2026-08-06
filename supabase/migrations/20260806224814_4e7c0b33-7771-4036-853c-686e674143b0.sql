CREATE OR REPLACE FUNCTION public.get_deudores_cobranzas()
 RETURNS TABLE(alumno_id uuid, nombre text, apellido text, email text, telefono text, grupo text, sede_id uuid, estado_alumno text, moneda text, fuente_tabla text, fuente_id uuid, concepto text, fecha date, dias_mora integer, saldo_item numeric, credito_disponible numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH norm AS (
    SELECT
      m.alumno_id,
      m.moneda,
      -- Los pagos de eventos viven en reservation_payments pero cancelan el
      -- cargo de event_reservations: los normalizamos a la misma clave.
      CASE WHEN m.fuente_tabla = 'reservation_payments' THEN 'event_reservations' ELSE m.fuente_tabla END AS fuente_tabla,
      CASE WHEN m.fuente_tabla = 'reservation_payments'
           THEN COALESCE((m.referencia_extra->>'reservation_id')::uuid, m.fuente_id)
           ELSE m.fuente_id END AS fuente_id,
      m.fecha, m.concepto, m.debe, m.haber
    FROM vw_cuenta_corriente_movimientos m
  ),
  items AS (
    SELECT
      n.alumno_id,
      n.moneda,
      n.fuente_tabla,
      n.fuente_id,
      max(n.fecha) FILTER (WHERE COALESCE(n.debe,0) > 0) AS fecha_cargo,
      max(n.fecha) AS fecha_any,
      (array_agg(n.concepto ORDER BY n.debe DESC, n.fecha))[1] AS concepto,
      sum(COALESCE(n.debe, 0) - COALESCE(n.haber, 0)) AS saldo_item
    FROM norm n
    GROUP BY n.alumno_id, n.moneda, n.fuente_tabla, n.fuente_id
  ),
  credito AS (
    SELECT i.alumno_id, i.moneda, sum(-i.saldo_item) AS credito
    FROM items i
    WHERE i.saldo_item < -0.01
    GROUP BY i.alumno_id, i.moneda
  ),
  venc AS (
    -- Vencimiento real para reservas de evento: primera cuota impaga vencida
    SELECT ri.reservation_id, min(ri.due_date) AS proximo_vencido
    FROM reservation_installments ri
    WHERE ri.status <> 'pagada'
      AND ri.due_date <= CURRENT_DATE
      AND GREATEST(COALESCE(ri.amount,0) - COALESCE(ri.paid_amount,0) - COALESCE(ri.condoned_amount,0), 0) > 0.01
    GROUP BY ri.reservation_id
  )
  SELECT
    i.alumno_id,
    a.nombre,
    a.apellido,
    a.email,
    a.telefono,
    a.grupo::text,
    a.sede_id,
    a.estado::text,
    i.moneda,
    i.fuente_tabla,
    i.fuente_id,
    i.concepto,
    COALESCE(i.fecha_cargo, i.fecha_any) AS fecha,
    GREATEST(0, (CURRENT_DATE - COALESCE(
      CASE WHEN i.fuente_tabla = 'event_reservations' THEN v.proximo_vencido END,
      i.fecha_cargo, i.fecha_any)))::integer AS dias_mora,
    round(i.saldo_item, 2) AS saldo_item,
    round(COALESCE(c.credito, 0), 2) AS credito_disponible
  FROM items i
  JOIN alumnos a ON a.id = i.alumno_id
  LEFT JOIN credito c ON c.alumno_id = i.alumno_id AND c.moneda = i.moneda
  LEFT JOIN venc v ON i.fuente_tabla = 'event_reservations' AND v.reservation_id = i.fuente_id
  WHERE i.saldo_item > 0.01
$function$;