CREATE OR REPLACE FUNCTION public.get_reservas_turnera_ocupadas(
  p_servicio_id uuid,
  p_desde date,
  p_hasta date
)
RETURNS TABLE (fecha date, hora_inicio time, coach_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.fecha, r.hora_inicio, r.coach_id
  FROM public.reservas_turnera r
  WHERE r.servicio_id = p_servicio_id
    AND r.fecha >= p_desde
    AND r.fecha <= p_hasta
    AND r.estado_operativo NOT IN ('cancelada_por_alumno','cancelada_por_admin');
$$;

GRANT EXECUTE ON FUNCTION public.get_reservas_turnera_ocupadas(uuid, date, date) TO anon, authenticated;