
-- 1) descuentos: link a evento específico
ALTER TABLE public.descuentos
  ADD COLUMN IF NOT EXISTS evento_id uuid REFERENCES public.events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_descuentos_evento_activo
  ON public.descuentos (evento_id) WHERE activo = true;

-- 2) event_surveys: persistir elección del bloque
ALTER TABLE public.event_surveys
  ADD COLUMN IF NOT EXISTS descuento_evento_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS descuento_codigo_id uuid REFERENCES public.descuentos(id) ON DELETE SET NULL;

-- 3) Lectura pública de un código (para banner sin login)
CREATE OR REPLACE FUNCTION public.get_promo_code(_codigo text, _evento_id uuid)
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
  IF _codigo IS NULL OR length(trim(_codigo)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT id, nombre, codigo, tipo, valor, activo, aplica_a,
         vigencia_desde, vigencia_hasta, max_usos, usos_actuales, evento_id
    INTO d
  FROM public.descuentos
  WHERE upper(codigo) = upper(trim(_codigo))
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
  IF d.evento_id IS NOT NULL AND _evento_id IS NOT NULL AND d.evento_id <> _evento_id THEN
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

GRANT EXECUTE ON FUNCTION public.get_promo_code(text, uuid) TO anon, authenticated;

-- 4) Consumo atómico de cupo global
CREATE OR REPLACE FUNCTION public.redeem_promo_code(_codigo text, _evento_id uuid, _alumno_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record;
  today date := current_date;
  updated_row record;
BEGIN
  SELECT id, codigo, tipo, valor, activo, aplica_a,
         vigencia_desde, vigencia_hasta, max_usos, usos_actuales, evento_id
    INTO d
  FROM public.descuentos
  WHERE upper(codigo) = upper(trim(coalesce(_codigo, '')))
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
  IF d.evento_id IS NOT NULL AND _evento_id IS NOT NULL AND d.evento_id <> _evento_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'scope_mismatch');
  END IF;
  IF d.aplica_a NOT IN ('eventos', 'todo') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'scope_mismatch');
  END IF;

  -- Consumo atómico
  UPDATE public.descuentos
     SET usos_actuales = usos_actuales + 1,
         updated_at = now()
   WHERE id = d.id
     AND (max_usos IS NULL OR usos_actuales < max_usos)
  RETURNING id, usos_actuales, max_usos INTO updated_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'maxed');
  END IF;

  -- Registrar asignación al alumno (idempotente por (alumno,descuento))
  IF _alumno_id IS NOT NULL THEN
    INSERT INTO public.descuentos_alumno (alumno_id, descuento_id, activo)
    VALUES (_alumno_id, d.id, true)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'descuento_id', d.id,
    'codigo', d.codigo,
    'tipo', d.tipo,
    'valor', d.valor,
    'usos_actuales', updated_row.usos_actuales,
    'max_usos', updated_row.max_usos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_promo_code(text, uuid, uuid) TO authenticated;
