-- Vinculación explícita y auditada de un reemplazante aunque el alojamiento haya cambiado.
-- Solo admin. No mueve dinero, no confirma pagos y no altera importes ni habitaciones.
CREATE OR REPLACE FUNCTION public.claim_reservation_transfer_explicit(
  p_transfer_id uuid, p_new_reservation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_transfer public.reservation_transfers%ROWTYPE;
  v_original public.event_reservations%ROWTYPE;
  v_replacement public.event_reservations%ROWTYPE;
  v_matching_alumnos uuid[];
  v_identity_linked boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_transfer_id IS NULL OR p_new_reservation_id IS NULL THEN
    RAISE EXCEPTION 'Indicar transferencia y reserva reemplazante';
  END IF;

  SELECT * INTO v_transfer FROM public.reservation_transfers
   WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transferencia inexistente'; END IF;

  IF v_transfer.replacement_reservation_id = p_new_reservation_id
     AND v_transfer.status <> 'cancelled' THEN
    RETURN jsonb_build_object('ok',true,'already_linked',true,'transfer_id',v_transfer.id);
  END IF;

  IF v_transfer.status <> 'listed' OR v_transfer.replacement_reservation_id IS NOT NULL
    OR v_transfer.agreement_defined_at IS NOT NULL THEN
    RAISE EXCEPTION 'El cupo ya está tomado o el acuerdo está definido';
  END IF;

  IF v_transfer.original_reservation_id = p_new_reservation_id THEN
    RAISE EXCEPTION 'El reemplazante no puede ser el titular original';
  END IF;

  SELECT * INTO v_original FROM public.event_reservations
   WHERE id=v_transfer.original_reservation_id FOR UPDATE;
  SELECT * INTO v_replacement FROM public.event_reservations
   WHERE id=p_new_reservation_id FOR UPDATE;

  IF v_original.id IS NULL OR v_replacement.id IS NULL THEN
    RAISE EXCEPTION 'Reserva original o reemplazante inexistente';
  END IF;
  IF v_original.event_id <> v_transfer.event_id
     OR v_replacement.event_id <> v_transfer.event_id THEN
    RAISE EXCEPTION 'Las reservas deben pertenecer al mismo evento';
  END IF;
  IF v_original.package_id IS DISTINCT FROM v_transfer.package_id THEN
    RAISE EXCEPTION 'El cupo publicado no coincide con el paquete original';
  END IF;
  IF v_original.reservation_status <> 'cancelada' THEN
    RAISE EXCEPTION 'El cupo original todavía no está liberado';
  END IF;
  IF v_replacement.reservation_status IN ('cancelada','rechazada','expirada')
     OR v_replacement.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede vincular una reserva cancelada';
  END IF;
  IF upper(coalesce(v_original.currency_snapshot,v_original.moneda,'ARS'))
     <> upper(coalesce(v_replacement.currency_snapshot,v_replacement.moneda,'ARS')) THEN
    RAISE EXCEPTION 'Las reservas usan monedas diferentes';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reservation_transfers
    WHERE replacement_reservation_id=p_new_reservation_id AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Esta reserva ya reemplaza otro cupo';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reservation_transfer_direct_payments
    WHERE replacement_reservation_id=p_new_reservation_id AND status='confirmed'
  ) THEN
    RAISE EXCEPTION 'La reserva tiene pagos directos previos: revisión manual';
  END IF;

  -- Guest creado antes de su cuenta: vincular solo si hay una coincidencia inequívoca de email.
  IF v_replacement.alumno_id IS NULL AND nullif(trim(v_replacement.external_email),'') IS NOT NULL THEN
    SELECT array_agg(DISTINCT a.id) INTO v_matching_alumnos
    FROM public.alumnos a
    WHERE lower(trim(a.email))=lower(trim(v_replacement.external_email))
       OR EXISTS (SELECT 1 FROM unnest(coalesce(a.emails_adicionales,ARRAY[]::text[])) ea
                  WHERE lower(trim(ea))=lower(trim(v_replacement.external_email)));
    IF coalesce(array_length(v_matching_alumnos,1),0)=1 THEN
      UPDATE public.event_reservations
      SET alumno_id=v_matching_alumnos[1],updated_at=now()
      WHERE id=p_new_reservation_id AND alumno_id IS NULL;
      v_identity_linked := true;
    END IF;
  END IF;

  UPDATE public.reservation_transfers
  SET replacement_reservation_id=p_new_reservation_id,
      status='payment_agreement_pending',
      updated_at=now()
  WHERE id=p_transfer_id AND status='listed' AND replacement_reservation_id IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'El cupo fue tomado simultáneamente'; END IF;

  INSERT INTO public.audit_log(user_id,user_email,user_role,action,entity_type,entity_id,details)
  VALUES(auth.uid(),auth.email(),'admin','reserva.transferencia.vinculacion_explicita',
         'reservation_transfer',p_transfer_id::text,
    jsonb_build_object('original_reservation_id',v_original.id,
      'replacement_reservation_id',v_replacement.id,
      'original_package_id',v_original.package_id,
      'replacement_package_id',v_replacement.package_id,
      'alumno_vinculado_por_email',v_identity_linked,
      'cambio_de_categoria',v_original.package_id IS DISTINCT FROM v_replacement.package_id,
      'reserva_total_sin_cambios',v_replacement.amount_total,
      'pagos_sin_cambios',v_replacement.amount_paid,
      'pago_directo_confirmado',0,
      'motivo','Vinculación explícita de administrador; no crea pagos ni modifica precios'));
  RETURN jsonb_build_object('ok',true,'transfer_id',p_transfer_id,
    'replacement_reservation_id',p_new_reservation_id,
    'cambio_de_categoria',v_original.package_id IS DISTINCT FROM v_replacement.package_id,
    'alumno_vinculado',v_identity_linked);
END
$fn$;

REVOKE ALL ON FUNCTION public.claim_reservation_transfer_explicit(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_reservation_transfer_explicit(uuid,uuid) TO authenticated,service_role;