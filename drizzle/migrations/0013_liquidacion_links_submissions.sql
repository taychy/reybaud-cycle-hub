-- Reintegro de estacionamiento separado (valor real, sin aumentos automáticos)
ALTER TABLE public.movimientos_liquidacion ADD COLUMN IF NOT EXISTS estacionamiento numeric NOT NULL DEFAULT 0;

CREATE TABLE public.liquidacion_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  mes text NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  activo boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  last_opened_at timestamptz,
  submitted_at timestamptz
);
CREATE UNIQUE INDEX liquidacion_links_coach_mes_activo ON public.liquidacion_links(coach_id, mes) WHERE activo;
GRANT SELECT ON public.liquidacion_links TO authenticated;
GRANT ALL ON public.liquidacion_links TO service_role;
ALTER TABLE public.liquidacion_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leen links de liquidacion" ON public.liquidacion_links FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TABLE public.liquidacion_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  mes text NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submitted_by text NOT NULL CHECK (submitted_by IN ('coach_link','admin')),
  submitted_by_user uuid,
  link_id uuid REFERENCES public.liquidacion_links(id) ON DELETE SET NULL,
  items_count integer NOT NULL DEFAULT 0,
  observaciones text,
  UNIQUE (coach_id, mes)
);
GRANT SELECT ON public.liquidacion_submissions TO authenticated;
GRANT ALL ON public.liquidacion_submissions TO service_role;
ALTER TABLE public.liquidacion_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leen envios de liquidacion" ON public.liquidacion_submissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Coach lee su envio" ON public.liquidacion_submissions FOR SELECT TO authenticated
  USING (coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid()));

CREATE TABLE public.liquidacion_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  mes text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('pre_cierre','post_cierre')),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','sent','suppressed','failed')),
  message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, mes, tipo)
);
GRANT SELECT ON public.liquidacion_reminder_log TO authenticated;
GRANT ALL ON public.liquidacion_reminder_log TO service_role;
ALTER TABLE public.liquidacion_reminder_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leen log de recordatorios" ON public.liquidacion_reminder_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- ===== Helpers internos =====
CREATE OR REPLACE FUNCTION public._liq_mes_ok(p_mes text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p_mes ~ '^\d{4}-\d{2}$' AND p_mes IN (
    to_char((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM'),
    to_char(((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - interval '1 month')::date, 'YYYY-MM'))
$$;

CREATE OR REPLACE FUNCTION public._liq_link_get_or_create(p_coach_id uuid, p_mes text, p_user uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token uuid; v_exp timestamptz;
BEGIN
  IF NOT public._liq_mes_ok(p_mes) THEN RAISE EXCEPTION 'Solo se generan links del mes actual o anterior'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coaches WHERE id = p_coach_id) THEN RAISE EXCEPTION 'Profesor inexistente'; END IF;
  -- Vence el día 10 del mes siguiente (fin del día, hora Argentina)
  v_exp := (((p_mes || '-01')::date + interval '1 month' + interval '10 days')::timestamp) AT TIME ZONE 'America/Argentina/Buenos_Aires';
  SELECT token INTO v_token FROM public.liquidacion_links
   WHERE coach_id = p_coach_id AND mes = p_mes AND activo AND expires_at > now();
  IF v_token IS NOT NULL THEN RETURN v_token; END IF;
  UPDATE public.liquidacion_links SET activo = false WHERE coach_id = p_coach_id AND mes = p_mes AND activo;
  INSERT INTO public.liquidacion_links (coach_id, mes, expires_at, created_by)
  VALUES (p_coach_id, p_mes, v_exp, p_user) RETURNING token INTO v_token;
  RETURN v_token;
END $$;

CREATE OR REPLACE FUNCTION public._liq_derivar_tipo(p_nombre text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_nombre IS NULL THEN 'reintegro'
    WHEN p_nombre ILIKE 'planilla%' THEN 'planilla'
    WHEN p_nombre ILIKE 'reuni%' THEN 'reunion_staff'
    WHEN p_nombre ILIKE 'capacitaci%' THEN 'capacitacion'
    WHEN p_nombre ILIKE 'extensi%' THEN 'extension_fondo'
    WHEN p_nombre ILIKE 'fondo%' THEN 'fondo_salida'
    WHEN p_nombre ILIKE 'pista%' OR p_nombre ILIKE 'grupal 2h%' THEN 'grupal_2h'
    WHEN p_nombre ILIKE 'grupal%' THEN 'grupal_1h30'
    WHEN p_nombre ILIKE 'particular%' THEN 'personalizada'
    WHEN p_nombre ILIKE 'elongaci%' THEN 'elongacion'
    ELSE 'otro' END
$$;

-- Inserta ítems adicionales. Valor de honorario SIEMPRE resuelto en servidor.
CREATE OR REPLACE FUNCTION public._liq_insert_items(p_coach_id uuid, p_mes text, p_items jsonb, p_origen_obs text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it jsonb; v_ini date; v_fin date; v_fecha date; v_hon record; v_base numeric; v_tipo text;
  v_ent numeric; v_est numeric; v_via numeric; v_ext numeric; v_obs text; v_n int := 0;
  v_allowed text[] := ARRAY['grupal_1h30','grupal_2h','fondo_salida','extension_fondo','tecnica','evento_escuela','evaluatoria','personalizada','planilla','reunion_staff','capacitacion','elongacion','reintegro','otro'];
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RETURN 0; END IF;
  IF jsonb_array_length(p_items) > 60 THEN RAISE EXCEPTION 'Demasiados ítems (máx. 60)'; END IF;
  v_ini := (p_mes || '-01')::date;
  v_fin := (v_ini + interval '1 month - 1 day')::date;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    BEGIN v_fecha := (it->>'fecha')::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Fecha inválida'; END;
    IF v_fecha IS NULL OR v_fecha < v_ini OR v_fecha > v_fin THEN RAISE EXCEPTION 'La fecha % no pertenece al mes %', v_fecha, p_mes; END IF;

    v_ent := COALESCE(NULLIF(it->>'entrada','')::numeric, 0);
    v_est := COALESCE(NULLIF(it->>'estacionamiento','')::numeric, 0);
    v_via := COALESCE(NULLIF(it->>'viaticos','')::numeric, 0);
    v_ext := COALESCE(NULLIF(it->>'extras','')::numeric, 0);
    IF v_ent < 0 OR v_est < 0 OR v_via < 0 OR v_ext < 0 THEN RAISE EXCEPTION 'Los importes no pueden ser negativos'; END IF;
    IF GREATEST(v_ent, v_est, v_via, v_ext) > 1000000 THEN RAISE EXCEPTION 'Importe fuera de rango'; END IF;

    v_base := 0; v_hon := NULL;
    IF NULLIF(it->>'honorario_id','') IS NOT NULL THEN
      SELECT id, nombre_concepto, valor INTO v_hon FROM public.honorarios
       WHERE id = (it->>'honorario_id')::uuid AND activo AND (coach_id IS NULL OR coach_id = p_coach_id);
      IF v_hon.id IS NULL THEN RAISE EXCEPTION 'Concepto no disponible'; END IF;
      v_base := COALESCE(v_hon.valor, 0);
    END IF;
    IF v_hon.id IS NULL AND v_ent + v_est + v_via + v_ext = 0 THEN RAISE EXCEPTION 'Cada fila necesita un concepto o un importe'; END IF;

    v_tipo := NULLIF(it->>'tipo_actividad','');
    IF v_tipo IS NULL OR NOT (v_tipo = ANY(v_allowed)) THEN v_tipo := public._liq_derivar_tipo(v_hon.nombre_concepto); END IF;

    v_obs := p_origen_obs
      || CASE WHEN v_hon.id IS NOT NULL THEN ' · ' || v_hon.nombre_concepto ELSE '' END
      || CASE WHEN v_est > 0 THEN ' · Estacionamiento $' || v_est::text ELSE '' END
      || COALESCE(' · ' || NULLIF(left(trim(it->>'observaciones'), 500), ''), '');

    INSERT INTO public.movimientos_liquidacion (
      coach_id, fecha, tipo_actividad, origen, grupo, nombre_externo,
      valor_base, viaticos, entrada, estacionamiento, extras, total,
      estado_operativo, estado_economico, observaciones
    ) VALUES (
      p_coach_id, v_fecha, v_tipo, 'carga_coach',
      NULLIF(left(trim(it->>'grupo'), 80), ''), NULLIF(left(trim(it->>'detalle'), 160), ''),
      v_base, v_via, v_ent, v_est, v_ext, v_base + v_via + v_ent + v_est + v_ext,
      'realizada', 'pendiente_revision', v_obs
    );
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public._liq_context(p_coach_id uuid, p_mes text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'coach_nombre', (SELECT nombre FROM public.coaches WHERE id = p_coach_id),
    'mes', p_mes,
    'submission', (SELECT jsonb_build_object('submitted_at', s.submitted_at, 'submitted_by', s.submitted_by, 'items_count', s.items_count)
                     FROM public.liquidacion_submissions s WHERE s.coach_id = p_coach_id AND s.mes = p_mes),
    'honorarios', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', h.id, 'nombre', h.nombre_concepto, 'categoria', h.categoria, 'valor', h.valor) ORDER BY h.categoria, h.nombre_concepto)
                     FROM public.honorarios h WHERE h.activo AND (h.coach_id IS NULL OR h.coach_id = p_coach_id)), '[]'::jsonb),
    'movimientos', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                        'id', m.id, 'fecha', m.fecha, 'tipo_actividad', m.tipo_actividad, 'origen', m.origen,
                        'grupo', m.grupo, 'detalle', COALESCE(m.nombre_externo, NULLIF(trim(concat_ws(' ', a.nombre, a.apellido)), '')),
                        'total', m.total, 'estado_economico', m.estado_economico, 'estado_operativo', m.estado_operativo) ORDER BY m.fecha, m.created_at)
                     FROM public.movimientos_liquidacion m LEFT JOIN public.alumnos a ON a.id = m.alumno_id
                     WHERE m.coach_id = p_coach_id
                       AND m.fecha BETWEEN (p_mes || '-01')::date AND ((p_mes || '-01')::date + interval '1 month - 1 day')::date), '[]'::jsonb)
  )
$$;

-- ===== RPCs públicas por token =====
CREATE OR REPLACE FUNCTION public.get_liquidacion_by_token(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_link record;
BEGIN
  SELECT * INTO v_link FROM public.liquidacion_links WHERE token = p_token;
  IF v_link.id IS NULL OR NOT v_link.activo THEN RETURN jsonb_build_object('error', 'invalid'); END IF;
  IF v_link.expires_at <= now() THEN RETURN jsonb_build_object('error', 'expired', 'mes', v_link.mes); END IF;
  UPDATE public.liquidacion_links SET last_opened_at = now() WHERE id = v_link.id;
  RETURN public._liq_context(v_link.coach_id, v_link.mes) || jsonb_build_object('expires_at', v_link.expires_at);
END $$;

CREATE OR REPLACE FUNCTION public.submit_liquidacion_by_token(p_token uuid, p_items jsonb, p_observaciones text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_link record; v_n int;
BEGIN
  SELECT * INTO v_link FROM public.liquidacion_links WHERE token = p_token FOR UPDATE;
  IF v_link.id IS NULL OR NOT v_link.activo THEN RAISE EXCEPTION 'Link inválido'; END IF;
  IF v_link.expires_at <= now() THEN RAISE EXCEPTION 'El link venció'; END IF;
  IF EXISTS (SELECT 1 FROM public.liquidacion_submissions WHERE coach_id = v_link.coach_id AND mes = v_link.mes) THEN
    RAISE EXCEPTION 'La liquidación de este mes ya fue enviada';
  END IF;
  v_n := public._liq_insert_items(v_link.coach_id, v_link.mes, p_items, 'Carga por link de liquidación');
  INSERT INTO public.liquidacion_submissions (coach_id, mes, submitted_by, link_id, items_count, observaciones)
  VALUES (v_link.coach_id, v_link.mes, 'coach_link', v_link.id, v_n, NULLIF(left(trim(p_observaciones), 1000), ''));
  UPDATE public.liquidacion_links SET submitted_at = now() WHERE id = v_link.id;
  RETURN jsonb_build_object('ok', true, 'items', v_n);
END $$;

-- ===== RPCs admin =====
CREATE OR REPLACE FUNCTION public.admin_get_liquidacion_link(p_coach_id uuid, p_mes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN public._liq_link_get_or_create(p_coach_id, p_mes, auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.admin_get_liquidacion_context(p_coach_id uuid, p_mes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_mes !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'Mes inválido'; END IF;
  RETURN public._liq_context(p_coach_id, p_mes);
END $$;

CREATE OR REPLACE FUNCTION public.admin_cargar_liquidacion(p_coach_id uuid, p_mes text, p_items jsonb, p_confirmar boolean DEFAULT false, p_observaciones text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int; v_conf boolean := false;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_mes !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'Mes inválido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coaches WHERE id = p_coach_id) THEN RAISE EXCEPTION 'Profesor inexistente'; END IF;
  v_n := public._liq_insert_items(p_coach_id, p_mes, p_items, 'Carga rápida admin');
  IF p_confirmar THEN
    INSERT INTO public.liquidacion_submissions (coach_id, mes, submitted_by, submitted_by_user, items_count, observaciones)
    VALUES (p_coach_id, p_mes, 'admin', auth.uid(), v_n, NULLIF(left(trim(p_observaciones), 1000), ''))
    ON CONFLICT (coach_id, mes) DO NOTHING;
    v_conf := FOUND;
  END IF;
  RETURN jsonb_build_object('ok', true, 'items', v_n, 'confirmada', v_conf);
END $$;

-- ===== Servicio (recordatorios) =====
CREATE OR REPLACE FUNCTION public.service_liquidacion_link(p_coach_id uuid, p_mes text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public._liq_link_get_or_create(p_coach_id, p_mes, NULL)
$$;

REVOKE ALL ON FUNCTION public._liq_link_get_or_create(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._liq_insert_items(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._liq_context(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_liquidacion_link(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_liquidacion_link(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_liquidacion_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_liquidacion_by_token(uuid, jsonb, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_liquidacion_link(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_liquidacion_context(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_cargar_liquidacion(uuid, text, jsonb, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_liquidacion_link(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_liquidacion_context(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cargar_liquidacion(uuid, text, jsonb, boolean, text) TO authenticated;