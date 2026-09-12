CREATE TABLE IF NOT EXISTS public.reingreso_selecciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL,
  plan_id uuid,
  periodo_inicio date NOT NULL,
  periodo_fin date NOT NULL,
  origen text NOT NULL DEFAULT 'alumno',
  suscripcion_id uuid,
  mp_payment_id text,
  motivo text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.reingreso_selecciones TO authenticated;
GRANT ALL ON public.reingreso_selecciones TO service_role;

ALTER TABLE public.reingreso_selecciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alumno ve sus selecciones de reingreso"
ON public.reingreso_selecciones FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.alumnos a
    WHERE a.id = reingreso_selecciones.alumno_id
      AND (a.user_id = auth.uid() OR lower(coalesce(a.email,'')) = lower(coalesce(auth.email(),'')))
  )
);

CREATE POLICY "Admin gestiona selecciones de reingreso"
ON public.reingreso_selecciones FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_reingreso_selecciones_alumno ON public.reingreso_selecciones(alumno_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reingreso_selecciones_sub ON public.reingreso_selecciones(suscripcion_id);

CREATE TRIGGER trg_reingreso_selecciones_updated
BEFORE UPDATE ON public.reingreso_selecciones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Contexto de reingreso: decide si hay que preguntar el período y devuelve opciones
CREATE OR REPLACE FUNCTION public.get_reingreso_checkout_context(p_alumno_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alumno RECORD;
  v_email text;
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_cur_ini date;
  v_cur_fin date;
  v_next_ini date;
  v_next_fin date;
  v_cubre_previo boolean;
  v_obl_actual RECORD;
  v_ultimo_fin date;
  v_es_reingreso boolean := false;
  v_motivo text := null;
  v_opciones jsonb;
  v_obl_next RECORD;
BEGIN
  SELECT id, nombre, apellido, email, estado, user_id INTO v_alumno
  FROM public.alumnos WHERE id = p_alumno_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_email := lower(coalesce(auth.email(), ''));
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
    OR (v_alumno.user_id IS NOT NULL AND v_alumno.user_id = auth.uid())
    OR (v_email <> '' AND lower(coalesce(v_alumno.email,'')) = v_email)
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_cur_ini := date_trunc('month', v_hoy)::date;
  v_cur_fin := (date_trunc('month', v_hoy) + interval '1 month - 1 day')::date;
  v_next_ini := (date_trunc('month', v_hoy) + interval '1 month')::date;
  v_next_fin := (date_trunc('month', v_hoy) + interval '2 month - 1 day')::date;

  -- ¿Hubo continuidad? Una obligación no cancelada que cubra el mes anterior.
  SELECT EXISTS (
    SELECT 1 FROM public.suscripciones s
    WHERE s.alumno_id = p_alumno_id
      AND s.cancelada_at IS NULL
      AND s.estado NOT IN ('cancelada','rechazada')
      AND s.fecha_inicio <= (v_cur_ini - 1)
      AND s.fecha_fin >= (v_cur_ini - 1)
  ) INTO v_cubre_previo;

  SELECT max(s.fecha_fin) INTO v_ultimo_fin
  FROM public.suscripciones s
  WHERE s.alumno_id = p_alumno_id
    AND s.cancelada_at IS NULL
    AND s.estado NOT IN ('cancelada','rechazada');

  SELECT s.id, s.estado, s.plan_id, s.precio_final, s.fecha_inicio, s.fecha_fin
    INTO v_obl_actual
  FROM public.suscripciones s
  WHERE s.alumno_id = p_alumno_id
    AND s.cancelada_at IS NULL
    AND s.estado NOT IN ('cancelada','rechazada')
    AND s.fecha_inicio <= v_cur_fin
    AND s.fecha_fin >= v_cur_ini
  ORDER BY s.created_at DESC
  LIMIT 1;

  SELECT s.id, s.estado, s.plan_id, s.precio_final
    INTO v_obl_next
  FROM public.suscripciones s
  WHERE s.alumno_id = p_alumno_id
    AND s.cancelada_at IS NULL
    AND s.estado NOT IN ('cancelada','rechazada')
    AND s.fecha_inicio <= v_next_fin
    AND s.fecha_fin >= v_next_ini
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_alumno.estado IS DISTINCT FROM 'activo' THEN
    v_es_reingreso := true;
    v_motivo := 'alumno_no_activo';
  ELSIF NOT v_cubre_previo AND v_obl_actual.id IS NULL THEN
    v_es_reingreso := true;
    v_motivo := 'gap_de_continuidad';
  END IF;

  v_opciones := jsonb_build_array(
    jsonb_build_object(
      'fecha_inicio', v_cur_ini,
      'fecha_fin', v_cur_fin,
      'suscripcion_id', v_obl_actual.id,
      'suscripcion_estado', v_obl_actual.estado,
      'plan_id', v_obl_actual.plan_id,
      'monto', v_obl_actual.precio_final,
      'es_deuda_existente', (v_obl_actual.id IS NOT NULL
        AND v_obl_actual.estado IN ('pendiente','pendiente_verificacion','pago_pendiente','vencida'))
    ),
    jsonb_build_object(
      'fecha_inicio', v_next_ini,
      'fecha_fin', v_next_fin,
      'suscripcion_id', v_obl_next.id,
      'suscripcion_estado', v_obl_next.estado,
      'plan_id', v_obl_next.plan_id,
      'monto', v_obl_next.precio_final,
      'es_deuda_existente', (v_obl_next.id IS NOT NULL
        AND v_obl_next.estado IN ('pendiente','pendiente_verificacion','pago_pendiente','vencida'))
    )
  );

  RETURN jsonb_build_object(
    'found', true,
    'alumno_id', p_alumno_id,
    'hoy', v_hoy,
    'estado_alumno', v_alumno.estado,
    'es_reingreso', v_es_reingreso,
    'motivo', v_motivo,
    'continuidad_mes_anterior', v_cubre_previo,
    'ultima_cobertura', v_ultimo_fin,
    'opciones', v_opciones
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_reingreso_checkout_context(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_reingreso_checkout_context(uuid) TO authenticated, service_role;

-- Registro explícito del período elegido en el reingreso
CREATE OR REPLACE FUNCTION public.registrar_seleccion_reingreso(
  p_alumno_id uuid,
  p_plan_id uuid,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_origen text DEFAULT 'alumno',
  p_suscripcion_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alumno RECORD;
  v_email text;
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_id uuid;
BEGIN
  SELECT id, email, user_id, nombre, apellido INTO v_alumno
  FROM public.alumnos WHERE id = p_alumno_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alumno inexistente'; END IF;

  v_email := lower(coalesce(auth.email(), ''));
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
    OR (v_alumno.user_id IS NOT NULL AND v_alumno.user_id = auth.uid())
    OR (v_email <> '' AND lower(coalesce(v_alumno.email,'')) = v_email)
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_fecha_inicio <> date_trunc('month', p_fecha_inicio)::date
     OR p_fecha_fin <> (date_trunc('month', p_fecha_inicio) + interval '1 month - 1 day')::date THEN
    RAISE EXCEPTION 'PERIODO_INVALIDO';
  END IF;

  IF p_fecha_inicio < date_trunc('month', v_hoy)::date
     OR p_fecha_inicio > (date_trunc('month', v_hoy) + interval '3 month')::date THEN
    RAISE EXCEPTION 'PERIODO_FUERA_DE_RANGO';
  END IF;

  INSERT INTO public.reingreso_selecciones
    (alumno_id, plan_id, periodo_inicio, periodo_fin, origen, suscripcion_id, motivo, created_by)
  VALUES
    (p_alumno_id, p_plan_id, p_fecha_inicio, p_fecha_fin,
     CASE WHEN p_origen IN ('alumno','admin') THEN p_origen ELSE 'alumno' END,
     p_suscripcion_id, p_motivo, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), nullif(v_email,''), coalesce(p_origen,'alumno'), 'reingreso_periodo_elegido',
          'reingreso_selecciones', v_id::text,
          jsonb_build_object('alumno_id', p_alumno_id, 'plan_id', p_plan_id,
                             'periodo_inicio', p_fecha_inicio, 'periodo_fin', p_fecha_fin,
                             'suscripcion_id', p_suscripcion_id));

  INSERT INTO public.student_activity_log
    (alumno_id, event_type, title, description, actor_id, actor_email, actor_role, reference_type, reference_id)
  VALUES (p_alumno_id, 'reingreso_periodo_elegido', 'Reingreso: período elegido',
          'Eligió pagar la mensualidad del período ' || to_char(p_fecha_inicio, 'DD/MM/YYYY') || ' al ' || to_char(p_fecha_fin, 'DD/MM/YYYY') || '.',
          auth.uid(), nullif(v_email,''), coalesce(p_origen,'alumno'), 'reingreso_selecciones', v_id::text);

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_seleccion_reingreso(uuid, uuid, date, date, text, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.registrar_seleccion_reingreso(uuid, uuid, date, date, text, uuid, text) TO authenticated, service_role;

-- Vincula la selección con la suscripción/pago finalmente generados
CREATE OR REPLACE FUNCTION public.completar_seleccion_reingreso(
  p_id uuid,
  p_suscripcion_id uuid DEFAULT NULL,
  p_mp_payment_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_alumno RECORD;
  v_email text := lower(coalesce(auth.email(), ''));
BEGIN
  SELECT * INTO v_row FROM public.reingreso_selecciones WHERE id = p_id;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT id, email, user_id INTO v_alumno FROM public.alumnos WHERE id = v_row.alumno_id;
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
    OR (v_alumno.user_id IS NOT NULL AND v_alumno.user_id = auth.uid())
    OR (v_email <> '' AND lower(coalesce(v_alumno.email,'')) = v_email)
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.reingreso_selecciones
     SET suscripcion_id = coalesce(p_suscripcion_id, suscripcion_id),
         mp_payment_id = coalesce(p_mp_payment_id, mp_payment_id)
   WHERE id = p_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.completar_seleccion_reingreso(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.completar_seleccion_reingreso(uuid, uuid, text) TO authenticated, service_role;