CREATE OR REPLACE FUNCTION public.get_deudores_cobranzas()
RETURNS TABLE (
  alumno_id uuid,
  nombre text,
  apellido text,
  email text,
  telefono text,
  grupo text,
  sede_id uuid,
  estado_alumno text,
  moneda text,
  fuente_tabla text,
  fuente_id uuid,
  concepto text,
  fecha date,
  dias_mora integer,
  saldo_item numeric,
  credito_disponible numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH items AS (
    SELECT
      m.alumno_id,
      m.moneda,
      m.fuente_tabla,
      m.fuente_id,
      max(m.fecha) AS fecha,
      (array_agg(m.concepto ORDER BY m.debe DESC, m.fecha))[1] AS concepto,
      sum(COALESCE(m.debe, 0) - COALESCE(m.haber, 0)) AS saldo_item
    FROM vw_cuenta_corriente_movimientos m
    GROUP BY m.alumno_id, m.moneda, m.fuente_tabla, m.fuente_id
  ),
  credito AS (
    SELECT i.alumno_id, i.moneda, sum(-i.saldo_item) AS credito
    FROM items i
    WHERE i.saldo_item < -0.01
    GROUP BY i.alumno_id, i.moneda
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
    i.fecha,
    GREATEST(0, (CURRENT_DATE - i.fecha))::integer AS dias_mora,
    round(i.saldo_item, 2) AS saldo_item,
    round(COALESCE(c.credito, 0), 2) AS credito_disponible
  FROM items i
  JOIN alumnos a ON a.id = i.alumno_id
  LEFT JOIN credito c ON c.alumno_id = i.alumno_id AND c.moneda = i.moneda
  WHERE i.saldo_item > 0.01
$$;

REVOKE ALL ON FUNCTION public.get_deudores_cobranzas() FROM public;
GRANT EXECUTE ON FUNCTION public.get_deudores_cobranzas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deudores_cobranzas() TO service_role;