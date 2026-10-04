CREATE OR REPLACE FUNCTION public.get_program_preinscriptos(p_plan_id uuid)
RETURNS TABLE (
  entry_id uuid, nombre text, email text, telefono text, respuestas jsonb,
  entry_estado text, created_at timestamptz, preguntas jsonb,
  alumno_ids uuid[], suscripciones jsonb,
  benefit_id uuid, benefit_precio_total numeric, benefit_precio_cuota numeric,
  benefit_cuotas integer, benefit_valid_until date, benefit_suscripcion_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
      WHERE s.plan_id = p_plan_id
        AND (s.alumno_id = ANY(ids.alumno_ids) OR s.id = b.suscripcion_id)
    ), '[]'::jsonb),
    b.id, b.precio_total, b.precio_cuota, b.cuotas_cantidad, b.valid_until, b.suscripcion_id
  FROM ent e
  LEFT JOIN LATERAL (
    SELECT pb.* FROM program_preinscripcion_benefits pb
    WHERE pb.plan_id = p_plan_id AND pb.es_prueba = false
      AND (pb.waitlist_entry_id = e.id OR (pb.waitlist_entry_id IS NULL AND lower(btrim(pb.email)) = e.em))
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
$$;

REVOKE ALL ON FUNCTION public.get_program_preinscriptos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_program_preinscriptos(uuid) TO authenticated;