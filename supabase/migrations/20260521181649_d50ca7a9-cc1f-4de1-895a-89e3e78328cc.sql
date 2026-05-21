CREATE OR REPLACE FUNCTION public.get_saldos_todos_alumnos()
RETURNS TABLE(
  alumno_id uuid,
  nombre text,
  apellido text,
  email text,
  telefono text,
  sede_id uuid,
  grupo text,
  estado text,
  moneda text,
  total_cargos numeric,
  total_pagos numeric,
  saldo numeric,
  ultimo_movimiento timestamptz,
  cantidad_movimientos integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT
    a.id AS alumno_id,
    a.nombre,
    a.apellido,
    a.email,
    a.telefono,
    a.sede_id,
    a.grupo::text AS grupo,
    a.estado::text AS estado,
    m.moneda,
    COALESCE(SUM(m.debe), 0)::numeric AS total_cargos,
    COALESCE(SUM(m.haber), 0)::numeric AS total_pagos,
    (COALESCE(SUM(m.debe), 0) - COALESCE(SUM(m.haber), 0))::numeric AS saldo,
    MAX(m.fecha::timestamptz) AS ultimo_movimiento,
    COUNT(*)::integer AS cantidad_movimientos
  FROM public.alumnos a
  JOIN public.vw_cuenta_corriente_movimientos m ON m.alumno_id = a.id
  GROUP BY a.id, a.nombre, a.apellido, a.email, a.telefono, a.sede_id, a.grupo, a.estado, m.moneda
  ORDER BY a.apellido, a.nombre, m.moneda;
END;
$function$;