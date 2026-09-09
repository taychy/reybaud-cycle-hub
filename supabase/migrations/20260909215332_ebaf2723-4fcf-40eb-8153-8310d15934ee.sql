-- 1) Campos públicos en plantillas
ALTER TABLE public.waitlist_question_templates
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS publicada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS titulo_publico text,
  ADD COLUMN IF NOT EXISTS descripcion_publica text,
  ADD COLUMN IF NOT EXISTS mensaje_confirmacion text,
  ADD COLUMN IF NOT EXISTS cupos_informados integer;

-- Backfill de slug seguro para plantillas existentes
UPDATE public.waitlist_question_templates t
   SET slug = left(
     NULLIF(
       regexp_replace(
         lower(translate(COALESCE(t.nombre,'plantilla'),
           'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
           'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
         '[^a-z0-9]+', '-', 'g'),
       '')
     , 60) || '-' || left(replace(t.id::text,'-',''), 6)
 WHERE t.slug IS NULL;

UPDATE public.waitlist_question_templates
   SET slug = 'plantilla-' || left(replace(id::text,'-',''), 8)
 WHERE slug IS NULL OR btrim(slug, '-') = '';

ALTER TABLE public.waitlist_question_templates ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_templates_slug
  ON public.waitlist_question_templates (lower(slug));

-- 2) Respuestas directas (independientes de eventos)
CREATE TABLE IF NOT EXISTS public.waitlist_template_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.waitlist_question_templates(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  email text NOT NULL,
  telefono text,
  respuestas jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado text NOT NULL DEFAULT 'nuevo',
  user_agent text,
  admin_visto_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist_template_entries TO authenticated;
GRANT ALL ON public.waitlist_template_entries TO service_role;

ALTER TABLE public.waitlist_template_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage waitlist template entries" ON public.waitlist_template_entries;
CREATE POLICY "Admins manage waitlist template entries"
  ON public.waitlist_template_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_template_entries_email
  ON public.waitlist_template_entries (template_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_waitlist_template_entries_visto
  ON public.waitlist_template_entries (admin_visto_at) WHERE admin_visto_at IS NULL;

DROP TRIGGER IF EXISTS trg_waitlist_template_entries_updated_at ON public.waitlist_template_entries;
CREATE TRIGGER trg_waitlist_template_entries_updated_at
BEFORE UPDATE ON public.waitlist_template_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) RPC pública: metadata de plantilla publicada
CREATE OR REPLACE FUNCTION public.get_waitlist_template_public(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'slug', t.slug,
    'titulo_publico', COALESCE(NULLIF(btrim(t.titulo_publico), ''), t.nombre),
    'descripcion_publica', t.descripcion_publica,
    'mensaje_confirmacion', t.mensaje_confirmacion,
    'cupos_informados', t.cupos_informados,
    'preguntas', COALESCE(t.preguntas, '[]'::jsonb)
  )
  FROM public.waitlist_question_templates t
  WHERE lower(t.slug) = lower(btrim(p_slug))
    AND t.publicada = true
    AND t.activa = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_waitlist_template_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_waitlist_template_public(text) TO anon, authenticated;

-- 4) RPC pública: enviar respuesta
CREATE OR REPLACE FUNCTION public.submit_waitlist_template_entry(
  p_slug text,
  p_nombre text,
  p_email text,
  p_telefono text,
  p_respuestas jsonb,
  p_user_agent text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.waitlist_question_templates%ROWTYPE;
  q jsonb;
  v_clean jsonb := '{}'::jsonb;
  v_val jsonb;
  v_txt text;
  v_arr jsonb;
  v_item jsonb;
  v_nombre text := left(btrim(COALESCE(p_nombre,'')), 120);
  v_email text := left(lower(btrim(COALESCE(p_email,''))), 160);
  v_tel text := left(btrim(COALESCE(p_telefono,'')), 40);
BEGIN
  SELECT * INTO t FROM public.waitlist_question_templates
   WHERE lower(slug) = lower(btrim(p_slug)) AND publicada = true AND activa = true
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_disponible');
  END IF;

  IF length(v_nombre) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nombre_invalido');
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_invalido');
  END IF;
  IF length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'telefono_invalido');
  END IF;

  FOR q IN SELECT * FROM jsonb_array_elements(COALESCE(t.preguntas, '[]'::jsonb))
  LOOP
    v_val := COALESCE(p_respuestas, '{}'::jsonb) -> (q->>'id');

    IF (q->>'tipo') = 'multi_choice' THEN
      v_arr := '[]'::jsonb;
      IF v_val IS NOT NULL AND jsonb_typeof(v_val) = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_val) LOOP
          IF jsonb_typeof(v_item) = 'string'
             AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(q->'opciones','[]'::jsonb)) o
                          WHERE o = (v_item #>> '{}')) THEN
            v_arr := v_arr || jsonb_build_array(v_item #>> '{}');
          END IF;
        END LOOP;
      END IF;
      IF jsonb_array_length(v_arr) = 0 THEN
        IF COALESCE((q->>'requerida')::boolean, false) THEN
          RETURN jsonb_build_object('ok', false, 'error', 'falta_respuesta', 'question_id', q->>'id');
        END IF;
      ELSE
        v_clean := v_clean || jsonb_build_object(q->>'id', v_arr);
      END IF;

    ELSE
      v_txt := NULLIF(btrim(COALESCE(v_val #>> '{}', '')), '');
      IF (q->>'tipo') = 'single_choice' AND v_txt IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(q->'opciones','[]'::jsonb)) o WHERE o = v_txt) THEN
          v_txt := NULL;
        END IF;
      END IF;
      IF (q->>'tipo') = 'number' AND v_txt IS NOT NULL AND v_txt !~ '^-?[0-9]+([.,][0-9]+)?$' THEN
        v_txt := NULL;
      END IF;
      IF (q->>'tipo') = 'date' AND v_txt IS NOT NULL AND v_txt !~ '^\d{4}-\d{2}-\d{2}$' THEN
        v_txt := NULL;
      END IF;
      IF v_txt IS NULL THEN
        IF COALESCE((q->>'requerida')::boolean, false) THEN
          RETURN jsonb_build_object('ok', false, 'error', 'falta_respuesta', 'question_id', q->>'id');
        END IF;
      ELSE
        v_clean := v_clean || jsonb_build_object(q->>'id', left(v_txt, 1000));
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.waitlist_template_entries (template_id, nombre, email, telefono, respuestas, user_agent)
  VALUES (t.id, v_nombre, v_email, NULLIF(v_tel,''), v_clean, left(COALESCE(p_user_agent,''), 300))
  ON CONFLICT (template_id, lower(email)) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        telefono = EXCLUDED.telefono,
        respuestas = EXCLUDED.respuestas,
        user_agent = EXCLUDED.user_agent,
        admin_visto_at = NULL,
        updated_at = now();

  RETURN jsonb_build_object('ok', true, 'mensaje', t.mensaje_confirmacion);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_waitlist_template_entry(text, text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_waitlist_template_entry(text, text, text, text, jsonb, text) TO anon, authenticated;

-- 5) RPCs admin
CREATE OR REPLACE FUNCTION public.get_waitlist_template_direct_entries(p_template_id uuid)
RETURNS TABLE (
  entry_id uuid, nombre text, email text, telefono text,
  estado text, respuestas jsonb, created_at timestamptz, updated_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RETURN; END IF;
  RETURN QUERY
    SELECT e.id, e.nombre, e.email, e.telefono, e.estado, e.respuestas, e.created_at, e.updated_at
      FROM public.waitlist_template_entries e
     WHERE e.template_id = p_template_id
     ORDER BY e.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_waitlist_template_direct_entries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_waitlist_template_direct_entries(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_waitlist_template_entries_seen(p_template_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RETURN 0; END IF;
  UPDATE public.waitlist_template_entries
     SET admin_visto_at = now()
   WHERE admin_visto_at IS NULL
     AND (p_template_id IS NULL OR template_id = p_template_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_waitlist_template_entries_seen(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_waitlist_template_entries_seen(uuid) TO authenticated;

-- 6) Novedades admin: incluir preinscripciones nuevas
CREATE OR REPLACE FUNCTION public.count_admin_novedades()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_seen jsonb := '{}'::jsonb;
  v_res jsonb := '{}'::jsonb;
  FN timestamptz := '-infinity'::timestamptz;
  f_alumnos timestamptz; f_eventos timestamptz; f_ventas timestamptz;
  f_pedidos timestamptz; f_entregas timestamptz; f_cambios timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN v_res; END IF;
  IF NOT (public.has_role(v_uid,'admin'::app_role) OR public.has_role(v_uid,'deposito'::app_role)) THEN
    RETURN v_res;
  END IF;

  SELECT COALESCE(jsonb_object_agg(section_key, seen_at), '{}'::jsonb) INTO v_seen
    FROM public.admin_section_seen WHERE user_id = v_uid;

  f_alumnos  := COALESCE((v_seen->>'alumnos')::timestamptz, FN);
  f_eventos  := COALESCE((v_seen->>'eventos')::timestamptz, FN);
  f_ventas   := COALESCE((v_seen->>'tienda_ventas')::timestamptz, FN);
  f_pedidos  := COALESCE((v_seen->>'pedidos_proveedor')::timestamptz, FN);
  f_entregas := COALESCE((v_seen->>'cobros_entrega')::timestamptz, FN);
  f_cambios  := COALESCE((v_seen->>'cambios_plan')::timestamptz, FN);

  v_res := jsonb_build_object(
    'alumnos', (SELECT COUNT(*) FROM public.alumnos WHERE created_at > f_alumnos)
             + (SELECT COUNT(*) FROM public.bajas_solicitudes WHERE created_at > f_alumnos AND estado = 'pendiente'),
    'eventos', (SELECT COUNT(*) FROM public.event_reservations WHERE created_at > f_eventos),
    'tienda_ventas', (SELECT COUNT(*) FROM public.store_orders WHERE created_at > f_ventas)
                   + (SELECT COUNT(*) FROM public.store_cambios WHERE created_at > f_ventas),
    'pedidos_proveedor', (SELECT COUNT(*) FROM public.supplier_orders WHERE created_at > f_pedidos),
    'cobros_entrega', (SELECT COUNT(*) FROM public.delivery_lists WHERE created_at > f_entregas),
    'cambios_plan', (SELECT COUNT(*) FROM public.solicitudes_cambio_plan WHERE created_at > f_cambios AND estado = 'pendiente'),
    'preinscripciones', (SELECT COUNT(*) FROM public.waitlist_template_entries WHERE admin_visto_at IS NULL)
  );

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_admin_novedades() TO authenticated;