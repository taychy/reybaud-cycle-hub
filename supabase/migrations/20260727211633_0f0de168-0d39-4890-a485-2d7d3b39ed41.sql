CREATE OR REPLACE FUNCTION public.release_room_on_cancel(_reservation_id uuid, _liberar boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res record;
  v_asg record;
  v_room record;
  v_event_title text;
  v_event_id uuid;
  v_name text;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_res FROM event_reservations WHERE id = _reservation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reservation_not_found');
  END IF;

  v_event_id := v_res.event_id;
  SELECT title INTO v_event_title FROM events WHERE id = v_event_id;

  SELECT COALESCE(
    (SELECT trim(concat_ws(' ', a.nombre, a.apellido)) FROM alumnos a WHERE a.id = v_res.alumno_id),
    (SELECT trim(concat_ws(' ', e.nombre, e.apellido)) FROM event_external_participants e WHERE e.id = v_res.external_participant_id),
    'Participante'
  ) INTO v_name;

  SELECT * INTO v_asg FROM event_room_assignments WHERE reservation_id = _reservation_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'had_room', false);
  END IF;

  SELECT * INTO v_room FROM event_rooms WHERE id = v_asg.room_id;

  IF _liberar THEN
    DELETE FROM event_room_assignments WHERE id = v_asg.id;

    INSERT INTO reservation_status_history (reservation_id, changed_by, changed_by_role, note)
    VALUES (_reservation_id, auth.uid(), 'admin',
      format('Cancelada — habitación liberada automáticamente (%s)', COALESCE(v_room.nombre, 'habitación')));

    INSERT INTO admin_notification_events (tipo, prioridad, reservation_id, payload, deduplication_key)
    VALUES (
      'cama_liberada', 'general', _reservation_id,
      jsonb_build_object(
        'evento', COALESCE(v_event_title, ''),
        'event_id', v_event_id,
        'habitacion', COALESCE(v_room.nombre, ''),
        'tipo_habitacion', COALESCE(v_room.tipo, ''),
        'genero', COALESCE(v_room.genero, ''),
        'participante', v_name
      ),
      'cama_liberada:' || _reservation_id::text
    )
    ON CONFLICT (deduplication_key) DO NOTHING;

    INSERT INTO tareas (tipo, origen, titulo, descripcion, rol_destino, entidad_tipo, entidad_id, prioridad, dedupe_key, metadata)
    VALUES (
      'automatica', 'evento_cama_liberada',
      format('Cama liberada en %s — ofrecer a lista de espera', COALESCE(v_event_title, 'evento')),
      format('Se canceló la reserva de %s y se liberó su lugar en %s. Enviar mail a la lista de espera para ocupar el cupo.',
             v_name, COALESCE(v_room.nombre, 'la habitación')),
      'super_admin', 'event_reservation', _reservation_id::text, 'alta',
      'cama_liberada:' || _reservation_id::text,
      jsonb_build_object('event_id', v_event_id, 'room_id', v_asg.room_id, 'habitacion', COALESCE(v_room.nombre, ''))
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

    RETURN jsonb_build_object('ok', true, 'had_room', true, 'liberada', true, 'habitacion', COALESCE(v_room.nombre, ''));
  ELSE
    INSERT INTO reservation_status_history (reservation_id, changed_by, changed_by_role, note)
    VALUES (_reservation_id, auth.uid(), 'admin',
      format('Cancelada — habitación NO liberada (%s)', COALESCE(v_room.nombre, 'habitación')));

    RETURN jsonb_build_object('ok', true, 'had_room', true, 'liberada', false, 'habitacion', COALESCE(v_room.nombre, ''));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_room_on_cancel(uuid, boolean) TO authenticated;