DROP FUNCTION IF EXISTS public.get_program_preinscriptos(uuid);
CREATE FUNCTION public.get_program_preinscriptos(p_plan_id uuid)
 RETURNS TABLE(entry_id uuid, nombre text, email text, telefono text, respuestas jsonb, entry_estado text, created_at timestamp with time zone, preguntas jsonb, alumno_ids uuid[], suscripciones jsonb, benefit_id uuid, benefit_precio_total numeric, benefit_precio_cuota numeric, benefit_cuotas integer, benefit_valid_until date, benefit_suscripcion_id uuid, benefit_email_sent_at timestamptz, benefit_email_status text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH guard AS (
    SELECT 1 WHERE has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())
  ), tpl AS (
    SELECT t.id, t.preguntas FROM planes p
    JOIN waitlist_question_templates t ON lower(t.slug) = lower(p.preinscripcion_slug)
    WHERE p.id = p_plan_id AND p.preinscripcion_slug IS NOT NULL AND EXISTS (SELECT 1 FROM guard)
  ), ent AS (
    SELECT e.*, lower(btrim(e.email)) AS em, tpl.preguntas FROM waitlist_template_entries e JOIN tpl ON tpl.id = e.template_id
  )
  SELECT e.id, e.nombre, e.email, e.telefono, e.respuestas, e.estado, e.created_at, e.preguntas,
    ids.alumno_ids,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'estado', s.estado, 'mp_status', s.mp_status, 'alumno_id', s.alumno_id, 'created_at', s.created_at) ORDER BY s.created_at DESC)
      FROM suscripciones s
      WHERE s.plan_id = p_plan_id AND (s.alumno_id = ANY(ids.alumno_ids) OR s.id = b.suscripcion_id)
    ), '[]'::jsonb),
    b.id, b.precio_total, b.precio_cuota, b.cuotas_cantidad, b.valid_until, b.suscripcion_id, b.email_sent_at, b.email_status
  FROM ent e
  LEFT JOIN LATERAL (
    SELECT pb.* FROM program_preinscripcion_benefits pb
    WHERE pb.plan_id = p_plan_id AND pb.es_prueba = false
      AND (pb.waitlist_entry_id = e.id OR lower(btrim(pb.email)) = e.em)
    ORDER BY (pb.waitlist_entry_id = e.id) DESC NULLS LAST, pb.activo DESC, pb.created_at DESC
    LIMIT 1
  ) b ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(array_agg(DISTINCT x.aid), '{}') AS alumno_ids FROM (
      SELECT a.id AS aid FROM alumnos a
        WHERE lower(btrim(a.email)) = e.em
           OR e.em = ANY (SELECT lower(btrim(z)) FROM unnest(COALESCE(a.emails_adicionales, '{}')) z)
      UNION
      SELECT al.alumno_id FROM alumno_auth_aliases al WHERE al.active AND lower(btrim(al.email)) = e.em
      UNION
      SELECT s2.alumno_id FROM suscripciones s2 WHERE s2.id = b.suscripcion_id
    ) x WHERE x.aid IS NOT NULL
  ) ids ON true
  ORDER BY e.created_at;
$function$;
GRANT EXECUTE ON FUNCTION public.get_program_preinscriptos(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_program_preinscripcion_benefits(
  p_plan_id uuid, p_precio_total numeric, p_precio_cuota numeric, p_cuotas integer, p_valid_until date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_created int := 0; v_existing int := 0; v_skipped int := 0; r record; v_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_precio_total IS NULL OR p_precio_total <= 0 OR p_valid_until IS NULL OR COALESCE(p_cuotas,1) < 1 THEN
    RAISE EXCEPTION 'Parámetros inválidos';
  END IF;
  FOR r IN
    SELECT DISTINCT ON (lower(btrim(e.email))) e.id, lower(btrim(e.email)) AS em, e.nombre, e.estado
    FROM planes p
    JOIN waitlist_question_templates t ON lower(t.slug) = lower(p.preinscripcion_slug)
    JOIN waitlist_template_entries e ON e.template_id = t.id
    WHERE p.id = p_plan_id
    ORDER BY lower(btrim(e.email)), e.created_at
  LOOP
    IF r.estado = 'descartado' OR r.em IS NULL OR r.em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;
    SELECT id INTO v_id FROM program_preinscripcion_benefits
      WHERE plan_id = p_plan_id AND es_prueba = false AND lower(email) = r.em LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE program_preinscripcion_benefits SET waitlist_entry_id = COALESCE(waitlist_entry_id, r.id) WHERE id = v_id;
      v_existing := v_existing + 1;
    ELSE
      INSERT INTO program_preinscripcion_benefits (plan_id, waitlist_entry_id, email, nombre, precio_total, precio_cuota, cuotas_cantidad, valid_until, es_prueba, activo)
      VALUES (p_plan_id, r.id, r.em, r.nombre, p_precio_total, p_precio_cuota, COALESCE(p_cuotas,1), p_valid_until, false, true)
      ON CONFLICT DO NOTHING;
      v_created := v_created + 1;
    END IF;
    v_id := NULL;
  END LOOP;
  INSERT INTO audit_log (user_id, action, table_name, record_id, details)
  VALUES (auth.uid(), 'assign_preinscripcion_benefits', 'program_preinscripcion_benefits', p_plan_id::text,
    jsonb_build_object('created', v_created, 'existing', v_existing, 'skipped', v_skipped, 'precio_total', p_precio_total, 'precio_cuota', p_precio_cuota, 'cuotas', p_cuotas, 'valid_until', p_valid_until));
  RETURN jsonb_build_object('created', v_created, 'existing', v_existing, 'skipped', v_skipped);
END $$;
REVOKE ALL ON FUNCTION public.assign_program_preinscripcion_benefits(uuid, numeric, numeric, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_program_preinscripcion_benefits(uuid, numeric, numeric, integer, date) TO authenticated;