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
  INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), CASE WHEN is_super_admin(auth.uid()) THEN 'super_admin' ELSE 'admin' END, 'assign_preinscripcion_benefits', 'program_preinscripcion_benefits', p_plan_id::text,
    jsonb_build_object('created', v_created, 'existing', v_existing, 'skipped', v_skipped, 'precio_total', p_precio_total, 'precio_cuota', p_precio_cuota, 'cuotas', p_cuotas, 'valid_until', p_valid_until));
  RETURN jsonb_build_object('created', v_created, 'existing', v_existing, 'skipped', v_skipped);
END $$;