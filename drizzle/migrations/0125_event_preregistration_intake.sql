CREATE OR REPLACE FUNCTION public.submit_event_preregistration(
  p_event_id uuid, p_package_id uuid, p_first_name text, p_last_name text, p_email text,
  p_phone text, p_extra_night boolean, p_comment text, p_consent boolean, p_user_agent text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_cfg jsonb; v_title text; v_pkg record; v_email text; v_first text; v_last text; v_phone text;
  v_comment text; v_alumno uuid; v_id uuid; v_existing uuid; v_extra boolean; v_label text; v_msg text;
BEGIN
  SELECT metadata->'preregistration', title INTO v_cfg, v_title FROM public.events WHERE id = p_event_id;
  IF v_cfg IS NULL OR v_cfg->>'enabled' IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'closed', 'error', 'La preinscripción no está abierta para este evento');
  END IF;
  IF p_consent IS DISTINCT FROM true THEN RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Necesitamos tu autorización para contactarte'); END IF;
  v_first := trim(coalesce(p_first_name, '')); v_last := trim(coalesce(p_last_name, ''));
  v_email := lower(trim(coalesce(p_email, ''))); v_phone := trim(coalesce(p_phone, ''));
  v_comment := left(trim(coalesce(p_comment, '')), 600);
  IF length(v_first) NOT BETWEEN 2 AND 50 OR length(v_last) NOT BETWEEN 2 AND 50
     OR length(v_email) > 150 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     OR v_phone !~ '^[+0-9() .-]+$' OR length(regexp_replace(v_phone, '\D', '', 'g')) NOT BETWEEN 8 AND 15 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Revisá tus datos de contacto');
  END IF;
  IF NOT (coalesce(v_cfg->'package_ids', '[]'::jsonb) ? p_package_id::text) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Alojamiento no disponible para preinscripción');
  END IF;
  SELECT id, nombre, precio, currency INTO v_pkg FROM public.event_packages WHERE id = p_package_id AND event_id = p_event_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Alojamiento no disponible para preinscripción'); END IF;
  v_extra := coalesce(p_extra_night, false);
  IF v_extra AND v_cfg->>'extra_night_interest' IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'La noche extra no corresponde a este camp');
  END IF;
  SELECT id INTO v_existing FROM public.event_waitlist_entries WHERE event_id = p_event_id AND lower(email) = v_email;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'duplicate', true); END IF;
  IF (SELECT count(*) FROM public.event_waitlist_entries WHERE event_id = p_event_id AND created_at > now() - interval '15 minutes') >= 40 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited', 'error', 'Recibimos muchas solicitudes. Probá de nuevo en unos minutos');
  END IF;
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_alumno FROM public.alumnos WHERE user_id = auth.uid() AND lower(email) = v_email LIMIT 1;
  END IF;
  v_label := v_pkg.nombre;
  v_msg := v_pkg.nombre || ' · ' || v_pkg.currency || ' ' || v_pkg.precio::text || ' estimados por ciclista. Noche extra: '
    || CASE WHEN v_extra THEN 'interés, sin precio ni reserva' ELSE 'no solicitada' END
    || '. Preinscripción sin reserva ni pago.' || CASE WHEN v_comment <> '' THEN ' Comentario: ' || v_comment ELSE '' END;
  INSERT INTO public.event_waitlist_entries (event_id, alumno_id, nombre, email, telefono, respuestas, origen, user_agent)
  VALUES (p_event_id, v_alumno, v_first || ' ' || v_last, v_email, v_phone,
    jsonb_build_object('tipo', 'consulta', 'kind', 'preinscripcion', 'opcion', v_pkg.id, 'opcion_label', v_label, 'evento', v_title,
      'mensaje', v_msg, 'first_name', v_first, 'last_name', v_last, 'package_id', v_pkg.id, 'package_name', v_pkg.nombre,
      'estimated_unit_price', v_pkg.precio, 'currency', v_pkg.currency, 'extra_night_interest', v_extra, 'comment', v_comment,
      'contact_consent', true, 'contact_consent_version', coalesce(v_cfg->>'consent_version', 'preinscripcion-v1'),
      'status', 'Preinscripción · sin reserva, cupo ni pago', 'submitted_at', now()),
    'preinscripcion_web', left(p_user_agent, 300))
  ON CONFLICT (event_id, lower(email)) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', true, 'duplicate', true); END IF;
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.submit_event_preregistration(uuid, uuid, text, text, text, text, boolean, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_event_preregistration(uuid, uuid, text, text, text, text, boolean, text, boolean, text) TO anon, authenticated, service_role;

UPDATE public.events SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('preregistration', jsonb_build_object(
  'enabled', true, 'extra_night_interest', true, 'consent_version', 'san-luis-preinscripcion-v1',
  'package_ids', jsonb_build_array('f6f4bc69-e7cb-42b6-9d6e-063104bf215a','02ce40fb-9c74-4a97-a820-d1978db5cd26','19dc0e38-62f5-45cf-9bdb-7960e6d78c73','2d4ac361-9f03-4504-8811-87c7c326ac5a')))
WHERE id = '408a8eb8-fb62-4a50-ad6d-040bd5716797';
UPDATE public.events SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('preregistration', jsonb_build_object(
  'enabled', true, 'extra_night_interest', false, 'consent_version', 'san-luis-preinscripcion-v1',
  'package_ids', jsonb_build_array('4f79eb11-a90b-4deb-9786-eadf8474bc8c','4f36e4ea-0684-4112-af4b-c64fb2cfd821','35bd597d-5a8d-4e39-bf97-504976e71c90','a2da8b8b-4b39-4a83-82b5-cbccfe1b51ee')))
WHERE id = '5380df24-6bbf-4d25-81cd-a1ab2b41bd94';