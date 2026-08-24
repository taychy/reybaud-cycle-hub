CREATE OR REPLACE FUNCTION public.admin_update_turnera_reservation(
  p_reservation_id uuid,
  p_coach_id uuid,
  p_fecha date,
  p_hora_inicio time,
  p_hora_fin time,
  p_sede_id uuid,
  p_nota text,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res record;
  v_conflict record;
  v_before jsonb;
  v_after jsonb;
  v_email text;
  v_role text := 'admin';
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo del cambio es obligatorio';
  END IF;

  SELECT * INTO v_res FROM public.reservas_turnera WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_res.estado_operativo LIKE 'cancelada%' THEN
    RAISE EXCEPTION 'No se puede reprogramar una reserva cancelada';
  END IF;

  IF p_coach_id IS NULL OR p_fecha IS NULL OR p_hora_inicio IS NULL OR p_hora_fin IS NULL THEN
    RAISE EXCEPTION 'Coach, fecha y horarios son obligatorios';
  END IF;

  IF p_hora_fin <= p_hora_inicio THEN
    RAISE EXCEPTION 'La hora de fin debe ser posterior a la hora de inicio';
  END IF;

  SELECT r.id, r.fecha, r.hora_inicio, r.hora_fin, r.nombre, r.apellido
    INTO v_conflict
  FROM public.reservas_turnera r
  WHERE r.id <> p_reservation_id
    AND r.coach_id = p_coach_id
    AND r.fecha = p_fecha
    AND r.estado_operativo IN ('reservada', 'realizada')
    AND r.hora_inicio < p_hora_fin
    AND r.hora_fin > p_hora_inicio
  ORDER BY r.hora_inicio
  LIMIT 1;

  IF v_conflict.id IS NOT NULL THEN
    RAISE EXCEPTION 'El profesor ya tiene un turno de % a % (%)',
      to_char(v_conflict.hora_inicio, 'HH24:MI'),
      to_char(v_conflict.hora_fin, 'HH24:MI'),
      btrim(coalesce(v_conflict.nombre, '') || ' ' || coalesce(v_conflict.apellido, ''));
  END IF;

  v_before := jsonb_build_object(
    'coach_id', v_res.coach_id,
    'fecha', v_res.fecha,
    'hora_inicio', v_res.hora_inicio,
    'hora_fin', v_res.hora_fin,
    'sede_id', v_res.sede_id,
    'nota', v_res.nota
  );
  v_after := jsonb_build_object(
    'coach_id', p_coach_id,
    'fecha', p_fecha,
    'hora_inicio', p_hora_inicio,
    'hora_fin', p_hora_fin,
    'sede_id', p_sede_id,
    'nota', p_nota
  );

  UPDATE public.reservas_turnera
     SET coach_id = p_coach_id,
         fecha = p_fecha,
         hora_inicio = p_hora_inicio,
         hora_fin = p_hora_fin,
         sede_id = p_sede_id,
         nota = p_nota,
         updated_at = now()
   WHERE id = p_reservation_id;

  SELECT ap.email, ap.role::text INTO v_email, v_role
  FROM public.admin_profiles ap
  WHERE ap.user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_email,
    coalesce(v_role, 'admin'),
    'reprogramar_reserva_turnera',
    'reserva_turnera',
    p_reservation_id::text,
    jsonb_build_object('motivo', btrim(p_motivo), 'before', v_before, 'after', v_after)
  );

  RETURN jsonb_build_object('ok', true, 'before', v_before, 'after', v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_turnera_reservation(uuid, uuid, date, time, time, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_turnera_reservation(uuid, uuid, date, time, time, uuid, text, text) TO authenticated;