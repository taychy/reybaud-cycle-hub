CREATE OR REPLACE FUNCTION public.release_room_on_cancel(_reservation_id uuid, _liberar boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_res record;
  v_asg record;
  v_room record;
  v_event_title text;
  v_event_id uuid;
  v_name text;
  v_pkg_reactivado boolean := false;
  v_evento_reactivado boolean := false;
  v_pkg_nombre text;
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

    -- Reactivar el paquete de la reserva (o el de la habitación) para que vuelva a venderse
    IF COALESCE(v_res.package_id, v_room.package_id) IS NOT NULL THEN
      UPDATE event_packages
         SET activo = true, updated_at = now()
       WHERE id = COALESCE(v_res.package_id, v_room.package_id)
         AND activo IS DISTINCT FROM true
      RETURNING nombre INTO v_pkg_nombre;
      IF FOUND THEN v_pkg_reactivado := true; END IF;
      IF v_pkg_nombre IS NULL THEN
        SELECT nombre INTO v_pkg_nombre FROM event_packages WHERE id = COALESCE(v_res.package_id, v_room.package_id);
      END IF;
    END IF;

    -- Si el evento estaba agotado, volver a publicarlo
    UPDATE events SET status = 'publicado', updated_at = now()
     WHERE id = v_event_id AND status = 'agotado';
    IF FOUND THEN v_evento_reactivado := true; END IF;

    INSERT INTO reservation_status_history (reservation_id, changed_by, changed_by_role, note)
    VALUES (_reservation_id, auth.uid(), 'admin',
      format('Cancelada — habitación liberada automáticamente (%s)%s%s',
        COALESCE(v_room.nombre, 'habitación'),
        CASE WHEN v_pkg_reactivado THEN format(' · paquete reactivado (%s)', COALESCE(v_pkg_nombre, '')) ELSE '' END,
        CASE WHEN v_evento_reactivado THEN ' · evento vuelto a publicado' ELSE '' END));

    INSERT INTO admin_notification_events (tipo, prioridad, reservation_id, payload, deduplication_key)
    VALUES (
      'cama_liberada', 'general', _reservation_id,
      jsonb_build_object(
        'evento', COALESCE(v_event_title, ''),
        'event_id', v_event_id,
        'habitacion', COALESCE(v_room.nombre, ''),
        'tipo_habitacion', COALESCE(v_room.tipo, ''),
        'genero', COALESCE(v_room.genero, ''),
        'participante', v_name,
        'paquete_reactivado', v_pkg_reactivado,
        'evento_reactivado', v_evento_reactivado
      ),
      'cama_liberada:' || _reservation_id::text
    )
    ON CONFLICT (deduplication_key) DO NOTHING;

    INSERT INTO tareas (tipo, origen, titulo, descripcion, rol_destino, entidad_tipo, entidad_id, prioridad, dedupe_key, metadata)
    VALUES (
      'automatica', 'evento_cama_liberada',
      format('Cama liberada en %s — ofrecer a lista de espera', COALESCE(v_event_title, 'evento')),
      format('Se canceló la reserva de %s y se liberó su lugar en %s. El paquete quedó activo nuevamente. Enviar mail a la lista de espera para ocupar el cupo.',
             v_name, COALESCE(v_room.nombre, 'la habitación')),
      'super_admin', 'event_reservation', _reservation_id::text, 'alta',
      'cama_liberada:' || _reservation_id::text,
      jsonb_build_object('event_id', v_event_id, 'room_id', v_asg.room_id, 'habitacion', COALESCE(v_room.nombre, ''))
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

    RETURN jsonb_build_object('ok', true, 'had_room', true, 'liberada', true,
      'habitacion', COALESCE(v_room.nombre, ''),
      'paquete_reactivado', v_pkg_reactivado,
      'evento_reactivado', v_evento_reactivado);
  ELSE
    INSERT INTO reservation_status_history (reservation_id, changed_by, changed_by_role, note)
    VALUES (_reservation_id, auth.uid(), 'admin',
      format('Cancelada — habitación NO liberada (%s)', COALESCE(v_room.nombre, 'habitación')));

    RETURN jsonb_build_object('ok', true, 'had_room', true, 'liberada', false, 'habitacion', COALESCE(v_room.nombre, ''));
  END IF;
END;
$function$;