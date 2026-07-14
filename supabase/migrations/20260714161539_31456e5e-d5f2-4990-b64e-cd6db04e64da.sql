CREATE OR REPLACE FUNCTION public.get_pending_event_promo(_alumno_id uuid, _evento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record;
  today date := current_date;
BEGIN
  IF _alumno_id IS NULL OR _evento_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_args');
  END IF;

  SELECT dc.id, dc.codigo, dc.nombre, dc.tipo, dc.valor, dc.activo,
         dc.vigencia_desde, dc.vigencia_hasta, dc.max_usos, dc.usos_actuales,
         dc.evento_id, dc.aplica_a
    INTO d
  FROM public.event_survey_responses r
  JOIN public.event_surveys s ON s.id = r.survey_id
  JOIN public.descuentos dc  ON dc.id = s.descuento_codigo_id
  WHERE r.alumno_id = _alumno_id
    AND s.descuento_evento_id = _evento_id
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF NOT d.activo THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive');
  END IF;
  IF d.vigencia_desde IS NOT NULL AND d.vigencia_desde > today THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_yet');
  END IF;
  IF d.vigencia_hasta IS NOT NULL AND d.vigencia_hasta < today THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF d.max_usos IS NOT NULL AND d.usos_actuales >= d.max_usos THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'maxed');
  END IF;
  IF d.evento_id IS NOT NULL AND d.evento_id <> _evento_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'scope_mismatch');
  END IF;
  IF d.aplica_a NOT IN ('eventos', 'todo') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'scope_mismatch');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'descuento_id', d.id,
    'codigo', d.codigo,
    'nombre', d.nombre,
    'tipo', d.tipo,
    'valor', d.valor,
    'max_usos', d.max_usos,
    'usos_actuales', d.usos_actuales,
    'evento_id', d.evento_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_event_promo(uuid, uuid) TO authenticated, anon;