
UPDATE public.servicios_turnera
SET slug = 'evaluatoria-60',
    tipo_actividad = 'evaluatoria',
    descripcion = 'Clase personalizada de 60 min para evaluar tu nivel técnico y rendimiento ciclístico. La usamos para asignarte al grupo adecuado o definir si necesitás algún tipo de clase específica.'
WHERE id = '961e20e7-fb33-40f2-88a2-6b7c4e509065';

UPDATE public.servicios_turnera
SET slug = 'personalizada-60',
    descripcion = 'Clase personalizada de 60 min. Todos los niveles.'
WHERE id = '515fa9bc-d5fd-4a3c-a01f-4191c50ecf20';

UPDATE public.servicios_turnera
SET slug = 'personalizada-90',
    descripcion = 'Clase personalizada de 90 min. Nivel inicial.'
WHERE id = '59c61243-7c4c-44f4-8eda-bff6e3a49ebe';

-- Limpiar disponibilidades del servicio "prueba" (mantiene el servicio inactivo por FK)
DELETE FROM public.disponibilidad_coaches WHERE servicio_id = '02c878f7-63a6-453d-aa39-e1ba8434a127';
UPDATE public.servicios_turnera SET activo = false WHERE id = '02c878f7-63a6-453d-aa39-e1ba8434a127';

-- Cross-blocking coach-time entre servicios que comparten coach
CREATE OR REPLACE FUNCTION public.get_reservas_turnera_ocupadas(
  p_servicio_id uuid, p_desde date, p_hasta date
)
RETURNS TABLE(fecha date, hora_inicio time without time zone, coach_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.fecha, r.hora_inicio, r.coach_id
  FROM public.reservas_turnera r
  WHERE r.fecha >= p_desde
    AND r.fecha <= p_hasta
    AND r.estado_operativo NOT IN ('cancelada_por_alumno','cancelada_por_admin')
    AND r.coach_id IN (
      SELECT DISTINCT dc.coach_id
      FROM public.disponibilidad_coaches dc
      WHERE dc.servicio_id = p_servicio_id
        AND dc.activo = true
    );
$function$;
