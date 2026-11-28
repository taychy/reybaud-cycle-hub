CREATE TABLE public.event_enrollment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  event_id uuid NOT NULL REFERENCES public.events(id),
  package_id uuid NOT NULL REFERENCES public.event_packages(id),
  preregistration_id uuid REFERENCES public.event_waitlist_entries(id) ON DELETE SET NULL,
  requester_user_id uuid,
  requester_alumno_id uuid REFERENCES public.alumnos(id),
  email text NOT NULL,
  phone text NOT NULL,
  people_count integer NOT NULL CHECK (people_count BETWEEN 1 AND 6),
  attendees jsonb NOT NULL CHECK (jsonb_typeof(attendees) = 'array'),
  extra_night_interest boolean NOT NULL DEFAULT false,
  comment text NOT NULL DEFAULT '',
  estimated_unit_price numeric NOT NULL CHECK (estimated_unit_price >= 0),
  estimated_total numeric NOT NULL CHECK (estimated_total >= 0),
  currency text NOT NULL DEFAULT 'ARS',
  status text NOT NULL DEFAULT 'recibida' CHECK (status IN ('recibida','en_revision','aprobada_cotizacion','pendiente_pago','confirmada','rechazada')),
  contact_consent boolean NOT NULL,
  final_conditions_accepted boolean NOT NULL,
  consent_version text NOT NULL,
  hotel_validated boolean NOT NULL DEFAULT false,
  approved_unit_price numeric CHECK (approved_unit_price IS NULL OR approved_unit_price > 0),
  admin_notes text NOT NULL DEFAULT '',
  reviewed_by uuid,
  reviewed_at timestamptz,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.event_enrollment_requests TO authenticated;
GRANT ALL ON public.event_enrollment_requests TO service_role;
ALTER TABLE public.event_enrollment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read enrollment requests"
ON public.event_enrollment_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE UNIQUE INDEX event_enrollment_requests_event_email_key
  ON public.event_enrollment_requests (event_id, lower(email));
CREATE INDEX event_enrollment_requests_event_status_idx
  ON public.event_enrollment_requests (event_id, status, created_at DESC);
CREATE INDEX event_enrollment_requests_preregistration_idx
  ON public.event_enrollment_requests (preregistration_id);

CREATE TABLE public.event_enrollment_request_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.event_enrollment_requests(id) ON DELETE CASCADE,
  actor_user_id uuid,
  action text NOT NULL,
  from_status text,
  to_status text,
  review_note text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.event_enrollment_request_history TO authenticated;
GRANT ALL ON public.event_enrollment_request_history TO service_role;
ALTER TABLE public.event_enrollment_request_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read enrollment request history"
ON public.event_enrollment_request_history FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE INDEX event_enrollment_request_history_request_idx
  ON public.event_enrollment_request_history (request_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.submit_event_enrollment_request(
  p_event_id uuid,
  p_package_id uuid,
  p_attendees jsonb,
  p_email text,
  p_phone text,
  p_people_count integer,
  p_extra_night boolean,
  p_comment text,
  p_contact_consent boolean,
  p_final_conditions_accepted boolean,
  p_website text,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg jsonb;
  v_pkg record;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(coalesce(p_phone, ''));
  v_comment text := trim(coalesce(p_comment, ''));
  v_attendee jsonb;
  v_first text;
  v_last text;
  v_existing public.event_enrollment_requests%ROWTYPE;
  v_preregistration uuid;
  v_alumno uuid;
  v_id uuid;
  v_reference text;
BEGIN
  IF coalesce(trim(p_website), '') <> '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'No pudimos validar el envío');
  END IF;
  IF p_contact_consent IS DISTINCT FROM true OR p_final_conditions_accepted IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Debés aceptar la política de privacidad y la modalidad de solicitud');
  END IF;
  SELECT metadata->'preregistration' INTO v_cfg FROM public.events WHERE id = p_event_id;
  IF v_cfg IS NULL OR v_cfg->>'enabled' IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'closed', 'error', 'La inscripción no está abierta para este evento');
  END IF;
  IF NOT (coalesce(v_cfg->'package_ids', '[]'::jsonb) ? p_package_id::text) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'El alojamiento no corresponde a este camp');
  END IF;
  SELECT id, event_id, nombre, precio, currency INTO v_pkg
  FROM public.event_packages WHERE id = p_package_id AND event_id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'El alojamiento no corresponde a este camp');
  END IF;
  IF p_people_count IS NULL OR p_people_count NOT BETWEEN 1 AND 6
     OR p_attendees IS NULL OR jsonb_typeof(p_attendees) <> 'array'
     OR jsonb_array_length(p_attendees) <> p_people_count THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Identificá a todas las personas de la solicitud');
  END IF;
  FOR v_attendee IN SELECT value FROM jsonb_array_elements(p_attendees) LOOP
    v_first := trim(coalesce(v_attendee->>'firstName', ''));
    v_last := trim(coalesce(v_attendee->>'lastName', ''));
    IF length(v_first) NOT BETWEEN 2 AND 50 OR length(v_last) NOT BETWEEN 2 AND 50 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Revisá nombre y apellido de cada persona');
    END IF;
  END LOOP;
  v_first := trim(coalesce(p_attendees->0->>'firstName', ''));
  v_last := trim(coalesce(p_attendees->0->>'lastName', ''));
  IF length(v_email) > 150 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     OR v_phone !~ '^[+0-9() .-]+$' OR length(regexp_replace(v_phone, '\D', '', 'g')) NOT BETWEEN 8 AND 15
     OR length(v_comment) > 600 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Revisá los datos de contacto');
  END IF;
  IF coalesce(p_extra_night, false) AND v_cfg->>'extra_night_interest' IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'La noche extra no corresponde a este camp');
  END IF;

  SELECT * INTO v_existing FROM public.event_enrollment_requests
  WHERE event_id = p_event_id AND lower(email) = v_email;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'status', v_existing.status);
  END IF;
  IF (SELECT count(*) FROM public.event_enrollment_requests
      WHERE event_id = p_event_id AND created_at > now() - interval '15 minutes') >= 40 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited', 'error', 'Recibimos muchas solicitudes. Probá de nuevo en unos minutos');
  END IF;

  SELECT id INTO v_preregistration FROM public.event_waitlist_entries
  WHERE event_id = p_event_id AND lower(email) = v_email LIMIT 1;
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_alumno FROM public.alumnos
    WHERE user_id = auth.uid() AND lower(email) = v_email LIMIT 1;
  END IF;
  v_id := gen_random_uuid();
  v_reference := 'SL27-' || upper(substr(replace(v_id::text, '-', ''), 1, 10));
  INSERT INTO public.event_enrollment_requests (
    id, reference, event_id, package_id, preregistration_id, requester_user_id, requester_alumno_id,
    email, phone, people_count, attendees, extra_night_interest, comment,
    estimated_unit_price, estimated_total, currency, contact_consent, final_conditions_accepted,
    consent_version, user_agent
  ) VALUES (
    v_id, v_reference, p_event_id, p_package_id, v_preregistration, auth.uid(), v_alumno,
    v_email, v_phone, p_people_count, p_attendees, coalesce(p_extra_night, false), v_comment,
    v_pkg.precio, v_pkg.precio * p_people_count, v_pkg.currency, true, true,
    coalesce(v_cfg->>'consent_version', 'preinscripcion-v1') || '+solicitud-v1', left(p_user_agent, 300)
  ) ON CONFLICT (event_id, lower(email)) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;
  INSERT INTO public.event_enrollment_request_history (request_id, actor_user_id, action, to_status, details)
  VALUES (v_id, auth.uid(), 'solicitud_recibida', 'recibida', jsonb_build_object(
    'package_id', p_package_id, 'people_count', p_people_count, 'preregistration_id', v_preregistration,
    'estimated_unit_price', v_pkg.precio, 'currency', v_pkg.currency, 'source', 'public_landing'
  ));
  RETURN jsonb_build_object(
    'ok', true, 'duplicate', false, 'id', v_id, 'reference', v_reference, 'status', 'recibida',
    'event_id', p_event_id, 'package_id', p_package_id, 'package_name', v_pkg.nombre,
    'people_count', p_people_count, 'estimated_unit_price', v_pkg.precio,
    'estimated_total', v_pkg.precio * p_people_count, 'currency', v_pkg.currency,
    'extra_night_interest', coalesce(p_extra_night, false)
  );
END
$function$;
REVOKE ALL ON FUNCTION public.submit_event_enrollment_request(uuid,uuid,jsonb,text,text,integer,boolean,text,boolean,boolean,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_event_enrollment_request(uuid,uuid,jsonb,text,text,integer,boolean,text,boolean,boolean,text,text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_review_event_enrollment_request(
  p_request_id uuid,
  p_status text,
  p_admin_notes text,
  p_hotel_validated boolean,
  p_approved_unit_price numeric,
  p_review_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before public.event_enrollment_requests%ROWTYPE;
  v_note text := trim(coalesce(p_review_note, ''));
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo un admin puede revisar solicitudes';
  END IF;
  IF p_status NOT IN ('recibida','en_revision','aprobada_cotizacion','pendiente_pago','confirmada','rechazada') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;
  SELECT * INTO v_before FROM public.event_enrollment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF p_status IN ('pendiente_pago','confirmada') THEN
    RAISE EXCEPTION 'Pago y confirmación están bloqueados: todavía no está conectada la validación atómica de inventario compartido entre ambos camps ni el circuito de reservas. Podés dejar la solicitud aprobada para cotización.';
  END IF;
  IF p_status = 'aprobada_cotizacion' AND (p_hotel_validated IS DISTINCT FROM true OR p_approved_unit_price IS NULL OR p_approved_unit_price <= 0) THEN
    RAISE EXCEPTION 'Para aprobar la cotización, validá el alojamiento y cargá un precio unitario final mayor a cero';
  END IF;
  IF p_status IN ('aprobada_cotizacion','rechazada') AND length(v_note) < 3 THEN
    RAISE EXCEPTION 'Cargá una nota de revisión para auditar esta decisión';
  END IF;
  UPDATE public.event_enrollment_requests SET
    status = p_status,
    admin_notes = left(trim(coalesce(p_admin_notes, '')), 2000),
    hotel_validated = coalesce(p_hotel_validated, false),
    approved_unit_price = p_approved_unit_price,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_request_id;
  INSERT INTO public.event_enrollment_request_history (
    request_id, actor_user_id, action, from_status, to_status, review_note, details
  ) VALUES (
    p_request_id, auth.uid(), 'revision_admin', v_before.status, p_status, left(v_note, 1000),
    jsonb_build_object('hotel_validated', coalesce(p_hotel_validated, false),
      'approved_unit_price', p_approved_unit_price, 'previous_hotel_validated', v_before.hotel_validated,
      'previous_approved_unit_price', v_before.approved_unit_price)
  );
  RETURN jsonb_build_object('ok', true, 'status', p_status, 'payment_enabled', false, 'seat_confirmed', false);
END
$function$;
REVOKE ALL ON FUNCTION public.admin_review_event_enrollment_request(uuid,text,text,boolean,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_event_enrollment_request(uuid,text,text,boolean,numeric,text) TO authenticated, service_role;