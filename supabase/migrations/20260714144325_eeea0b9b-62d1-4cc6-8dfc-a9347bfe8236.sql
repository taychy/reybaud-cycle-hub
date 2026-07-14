
CREATE OR REPLACE FUNCTION public.get_reserva_turnera_by_token(_id uuid, _token uuid)
RETURNS TABLE (
  id uuid,
  nombre text,
  apellido text,
  email text,
  fecha date,
  hora_inicio time,
  hora_fin time,
  pago_estado text,
  pago_monto numeric,
  moneda_snapshot text,
  metodo_pago text,
  hold_expira_at timestamptz,
  upload_token uuid,
  comprobante_url text,
  motivo_rechazo text,
  servicio_id uuid,
  servicio_nombre text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.nombre, r.apellido, r.email, r.fecha, r.hora_inicio, r.hora_fin,
         r.pago_estado, r.pago_monto, r.moneda_snapshot, r.metodo_pago,
         r.hold_expira_at, r.upload_token, r.comprobante_url, r.motivo_rechazo,
         r.servicio_id, s.nombre AS servicio_nombre
  FROM public.reservas_turnera r
  LEFT JOIN public.servicios_turnera s ON s.id = r.servicio_id
  WHERE r.id = _id
    AND r.upload_token IS NOT NULL
    AND r.upload_token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_reserva_turnera_by_token(uuid, uuid) TO anon, authenticated;
