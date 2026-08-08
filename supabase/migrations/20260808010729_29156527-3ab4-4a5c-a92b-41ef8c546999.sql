CREATE OR REPLACE FUNCTION public.crear_suscripcion_para_imputar(
  _alumno_id uuid,
  _plan_id uuid,
  _fecha_inicio date,
  _precio numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan record;
  v_inicio date;
  v_fin date;
  v_precio numeric;
  v_sub_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_plan FROM public.planes WHERE id = _plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;

  v_inicio := date_trunc('month', COALESCE(_fecha_inicio, CURRENT_DATE))::date;
  v_fin := (v_inicio + INTERVAL '1 month - 1 day')::date;
  v_precio := COALESCE(_precio, v_plan.precio, 0);

  SELECT s.id INTO v_sub_id
    FROM public.suscripciones s
   WHERE s.alumno_id = _alumno_id
     AND s.plan_id = _plan_id
     AND s.fecha_inicio = v_inicio
     AND s.cancelada_at IS NULL
     AND s.estado <> 'cancelada'
   LIMIT 1;

  IF v_sub_id IS NOT NULL THEN
    RETURN v_sub_id;
  END IF;

  PERFORM set_config('app.sub_internal', 'on', true);

  INSERT INTO public.suscripciones (
    alumno_id, plan_id, estado, fecha_inicio, fecha_fin,
    precio_base, precio_final, origen_registro, auto_renovacion, notas
  ) VALUES (
    _alumno_id, _plan_id, 'pendiente_pago', v_inicio, v_fin,
    v_precio, v_precio, 'cargado_admin', (v_fin >= CURRENT_DATE),
    'Mensualidad generada desde el reparto de un pago familiar'
  ) RETURNING id INTO v_sub_id;

  PERFORM set_config('app.sub_internal', 'off', true);

  RETURN v_sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_suscripcion_para_imputar(uuid, uuid, date, numeric) TO authenticated;