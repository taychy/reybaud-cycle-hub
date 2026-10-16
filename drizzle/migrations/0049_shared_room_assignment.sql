ALTER TABLE public.event_reservations
  ADD COLUMN IF NOT EXISTS rooming_asignacion_estado text,
  ADD COLUMN IF NOT EXISTS rooming_acompanante_nombre text,
  ADD COLUMN IF NOT EXISTS rooming_asignacion_consentimiento jsonb,
  ADD COLUMN IF NOT EXISTS rooming_asignacion_updated_at timestamptz;

ALTER TABLE public.event_reservations
  ADD CONSTRAINT event_reservations_rooming_asignacion_estado_check
  CHECK (rooming_asignacion_estado IS NULL OR rooming_asignacion_estado IN
    ('pendiente_asignacion','acompanante_propuesto','completa','revision_conversion'));

-- Cotización de la obligación: diferencia real (individual - doble) con precios vigentes del sistema.
CREATE OR REPLACE FUNCTION public.shared_room_assignment_quote(p_event_id uuid, p_package_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg jsonb; v_single uuid; v_double numeric; v_double_cur text; v_ind numeric; v_ind_cur text; v_ppl int;
BEGIN
  SELECT metadata->'shared_room_assignment' INTO cfg FROM events WHERE id = p_event_id;
  IF cfg IS NULL OR coalesce((cfg->>'enabled')::boolean,false) = false THEN
    RETURN jsonb_build_object('applies', false);
  END IF;
  SELECT personas_por_habitacion INTO v_ppl FROM event_packages WHERE id = p_package_id AND event_id = p_event_id;
  IF coalesce(v_ppl,0) <> 2 THEN RETURN jsonb_build_object('applies', false); END IF;
  v_single := nullif(cfg->>'single_package_id','')::uuid;
  SELECT precio, currency INTO v_double, v_double_cur FROM get_package_active_price(p_package_id, now()) LIMIT 1;
  IF v_single IS NOT NULL AND EXISTS (SELECT 1 FROM event_packages WHERE id=v_single AND event_id=p_event_id AND activo) THEN
    SELECT precio, currency INTO v_ind, v_ind_cur FROM get_package_active_price(v_single, now()) LIMIT 1;
  END IF;
  IF v_double IS NULL OR v_ind IS NULL OR v_double_cur IS DISTINCT FROM v_ind_cur OR v_ind <= v_double
     OR nullif(cfg->>'deadline','') IS NULL THEN
    RETURN jsonb_build_object('applies', true, 'blocked', true,
      'reason', 'No hay precio individual o diferencia definida en el sistema');
  END IF;
  RETURN jsonb_build_object('applies', true, 'blocked', false,
    'deadline', cfg->>'deadline', 'version', coalesce(cfg->>'version','1'),
    'double_price', v_double, 'single_price', v_ind, 'difference', round(v_ind - v_double, 2),
    'currency', v_ind_cur, 'single_package_id', v_single);
END $$;
GRANT EXECUTE ON FUNCTION public.shared_room_assignment_quote(uuid, uuid) TO anon, authenticated, service_role;

-- Guarda: una reserva que pide asignación en doble (evento con política) exige consentimiento
-- que coincida con la cotización vigente del servidor; deriva el estado inicial.
CREATE OR REPLACE FUNCTION public.trg_shared_room_assignment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q jsonb;
BEGIN
  IF NEW.package_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.prefiere_asignacion IS NOT DISTINCT FROM OLD.prefiere_asignacion
     AND NEW.package_id IS NOT DISTINCT FROM OLD.package_id
     AND NEW.rooming_asignacion_consentimiento IS NOT DISTINCT FROM OLD.rooming_asignacion_consentimiento THEN
    RETURN NEW;
  END IF;
  q := shared_room_assignment_quote(NEW.event_id, NEW.package_id);
  IF coalesce((q->>'applies')::boolean,false) = false THEN RETURN NEW; END IF;
  IF coalesce(NEW.prefiere_asignacion,false) THEN
    IF coalesce((q->>'blocked')::boolean,false) THEN
      RAISE EXCEPTION 'La asignación de acompañante no está disponible: %', q->>'reason';
    END IF;
    IF NEW.rooming_asignacion_consentimiento IS NULL
       OR coalesce((NEW.rooming_asignacion_consentimiento->>'acepta')::boolean,false) = false
       OR (NEW.rooming_asignacion_consentimiento->>'difference')::numeric IS DISTINCT FROM (q->>'difference')::numeric
       OR NEW.rooming_asignacion_consentimiento->>'currency' IS DISTINCT FROM q->>'currency' THEN
      RAISE EXCEPTION 'Falta aceptar la condición de habitación doble compartida con el importe vigente';
    END IF;
    IF TG_OP = 'INSERT' OR NEW.rooming_asignacion_estado IS NULL THEN
      NEW.rooming_asignacion_estado := 'pendiente_asignacion';
    END IF;
  ELSIF nullif(trim(coalesce(NEW.rooming_acompanante_nombre,'')),'') IS NOT NULL AND NEW.rooming_asignacion_estado IS NULL THEN
    NEW.rooming_asignacion_estado := 'acompanante_propuesto';
  END IF;
  NEW.rooming_asignacion_updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_shared_room_assignment_guard ON public.event_reservations;
CREATE TRIGGER trg_shared_room_assignment_guard
  BEFORE INSERT OR UPDATE ON public.event_reservations
  FOR EACH ROW EXECUTE FUNCTION public.trg_shared_room_assignment_guard();

-- Cambio manual de estado por Administración, con trazabilidad.
CREATE OR REPLACE FUNCTION public.admin_set_rooming_asignacion(
  p_reservation_id uuid, p_estado text, p_acompanante text DEFAULT NULL, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; q jsonb; avail int;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Solo Administración'; END IF;
  IF p_estado NOT IN ('pendiente_asignacion','acompanante_propuesto','completa','revision_conversion') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;
  SELECT * INTO r FROM event_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
  IF r.reservation_status = 'cancelada' THEN RAISE EXCEPTION 'La reserva está cancelada'; END IF;
  IF p_estado = 'revision_conversion' THEN
    q := shared_room_assignment_quote(r.event_id, r.package_id);
    SELECT coalesce(sum(greatest(available,0)),0) INTO avail
      FROM get_package_availability_breakdown(nullif(q->>'single_package_id','')::uuid);
    IF coalesce(avail,0) <= 0 THEN
      RAISE EXCEPTION 'No hay habitación individual físicamente disponible para convertir';
    END IF;
  END IF;
  UPDATE event_reservations SET
    rooming_asignacion_estado = p_estado,
    rooming_acompanante_nombre = coalesce(nullif(trim(p_acompanante),''), rooming_acompanante_nombre),
    rooming_asignacion_updated_at = now()
  WHERE id = p_reservation_id;
  INSERT INTO reservation_status_history(reservation_id, new_reservation_status, new_payment_status, changed_by, changed_by_role, note)
  VALUES (p_reservation_id, r.reservation_status, r.payment_status, auth.uid(), 'admin',
    'Habitación compartida: ' || coalesce(r.rooming_asignacion_estado,'—') || ' → ' || p_estado
    || coalesce(' · ' || nullif(trim(p_acompanante),''), '') || coalesce(' · ' || nullif(trim(p_nota),''), ''));
  RETURN jsonb_build_object('ok', true, 'estado', p_estado);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_rooming_asignacion(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_rooming_asignacion(uuid,text,text,text) TO authenticated, service_role;