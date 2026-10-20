-- San Luis: una sola aprobación administrativa libera automáticamente la plaza
-- cuando se valida devolución o crédito. El proceso usa el flujo existente de
-- renuncia + liberación, con historial, validación de reservas y auditoría.
-- Asistencias de noviembre NO liberan cupos. Ni devolución ni crédito se ejecutan.
-- La publicación/reventa continúa bajo su autorización independiente.
-- Tests de los tres caminos (refund, credit, attend) ejecutados en subtransacciones
-- completamente revertidas: sin respuestas de prueba ni liberaciones persistidas.

CREATE OR REPLACE FUNCTION public.admin_review_rescheduling(p_reservation_id uuid, p_revision integer, p_status text, p_note text, p_command_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE oldrow reservation_rescheduling_requests%ROWTYPE;newrow reservation_rescheduling_requests%ROWTYPE; seatrow rescheduling_seat_releases%ROWTYPE; seat_reason text; seat_version integer; BEGIN
IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
IF p_status IS NULL OR p_status NOT IN ('pendiente','en_revision','validada','requiere_contacto') OR length(trim(coalesce(p_note,'')))=0 OR length(p_note)>2000 OR p_command_id IS NULL THEN RAISE EXCEPTION 'Estado y nota obligatorios'; END IF;
PERFORM 1 FROM public.event_reservations WHERE id=p_reservation_id FOR UPDATE;
SELECT * INTO oldrow FROM reservation_rescheduling_requests WHERE reservation_id=p_reservation_id FOR UPDATE;
IF EXISTS(SELECT 1 FROM reservation_rescheduling_history WHERE command_id=p_command_id) THEN
IF NOT EXISTS(SELECT 1 FROM reservation_rescheduling_history WHERE command_id=p_command_id AND reservation_id=p_reservation_id AND origin='admin' AND after_data->>'review_status'=p_status AND after_data->>'admin_note'=p_note) THEN RAISE EXCEPTION 'Identificador ya utilizado para otra operación'; END IF;
RETURN; END IF;
IF oldrow.reservation_id IS NULL OR oldrow.revision<>p_revision THEN RAISE EXCEPTION 'La respuesta cambió. Recargá'; END IF;
SELECT * INTO seatrow FROM public.rescheduling_seat_releases WHERE source_reservation_id=p_reservation_id FOR UPDATE;
IF seatrow.id IS NOT NULL AND seatrow.state IN ('liberada','ofrecida','ocupada') THEN
 RAISE EXCEPTION 'El cupo ya está liberado u ocupado. Para modificar la resolución, revisá antes la gestión del cupo.';
END IF;
IF p_status='validada' AND oldrow.choice IN ('refund','credit') THEN
 IF (SELECT reservation_status FROM public.event_reservations WHERE id=p_reservation_id)<>'reserva_confirmada' THEN
  RAISE EXCEPTION 'La reserva ya no está vigente; revisar cupo antes de validar';
 END IF;
END IF;
UPDATE reservation_rescheduling_requests SET review_status=p_status,admin_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now(),revision=revision+1,command_id=p_command_id WHERE reservation_id=p_reservation_id RETURNING * INTO newrow;
INSERT INTO reservation_rescheduling_history(reservation_id,revision,command_id,actor_id,origin,before_data,after_data) VALUES(p_reservation_id,newrow.revision,p_command_id,auth.uid(),'admin',to_jsonb(oldrow),to_jsonb(newrow));
IF p_status='validada' AND newrow.choice IN ('refund','credit') THEN
 -- Una única aprobación deja la plaza liberada, sin ejecutar dinero ni ofrecerla públicamente.
 -- Reutilizar el flujo de cupos que valida paquete, reserva y revisión y escribe historial.
 seat_reason := 'Aprobación de baja por reprogramación San Luis: ' || btrim(p_note);
 IF seatrow.id IS NULL OR seatrow.state='anulada' THEN
  PERFORM public.admin_rescheduling_seat_action(p_reservation_id,'confirm_renunciation',seat_reason,coalesce(seatrow.version,0),gen_random_uuid());
 ELSE
  -- Renuncia previamente confirmada en el flujo anterior: actualizar revisión de forma segura.
  IF seatrow.state<>'renuncia_confirmada' THEN RAISE EXCEPTION 'Cupo no disponible para liberar'; END IF;
  UPDATE public.rescheduling_seat_releases SET request_revision=newrow.revision,version=version+1,updated_at=now()
   WHERE id=seatrow.id;
 END IF;
 SELECT version INTO seat_version FROM public.rescheduling_seat_releases WHERE source_reservation_id=p_reservation_id;
 PERFORM public.admin_rescheduling_seat_action(p_reservation_id,'approve_release',seat_reason,seat_version,gen_random_uuid());
END IF;
END $function$

