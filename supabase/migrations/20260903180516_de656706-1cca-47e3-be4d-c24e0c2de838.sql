-- =========================================================
-- 1) CATÁLOGO DE CATEGORÍAS DE GASTOS
-- =========================================================
CREATE TABLE public.gasto_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  activa boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 100,
  archivada_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gasto_categorias_nombre_uidx ON public.gasto_categorias (lower(nombre));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gasto_categorias TO authenticated;
GRANT ALL ON public.gasto_categorias TO service_role;
ALTER TABLE public.gasto_categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gasto_categorias_read" ON public.gasto_categorias
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "gasto_categorias_admin" ON public.gasto_categorias
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER gasto_categorias_updated_at
  BEFORE UPDATE ON public.gasto_categorias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Semilla: categorías reales ya usadas + las nuevas necesarias
INSERT INTO public.gasto_categorias (nombre, orden)
SELECT DISTINCT btrim(g.categoria), 100
FROM public.gastos g
WHERE g.categoria IS NOT NULL AND btrim(g.categoria) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.gasto_categorias (nombre, orden)
SELECT * FROM (VALUES ('Por categorizar', 1), ('Profesores / Liquidaciones', 10)) v(nombre, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM public.gasto_categorias c WHERE lower(c.nombre) = lower(v.nombre)
);

-- =========================================================
-- 2) GASTOS: vínculo al catálogo + trazabilidad
-- =========================================================
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.gasto_categorias(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS categoria_origen text NOT NULL DEFAULT 'importado',
  ADD COLUMN IF NOT EXISTS categoria_regla_id uuid,
  ADD COLUMN IF NOT EXISTS categoria_asignada_at timestamptz,
  ADD COLUMN IF NOT EXISTS categoria_asignada_por uuid;

ALTER TABLE public.gastos
  ADD CONSTRAINT gastos_categoria_origen_chk
  CHECK (categoria_origen IN ('importado', 'regla', 'manual', 'sin_categoria'));

CREATE INDEX IF NOT EXISTS gastos_categoria_id_idx ON public.gastos (categoria_id);

-- Backfill sólo por coincidencia exacta de nombre
UPDATE public.gastos g
SET categoria_id = c.id, categoria_origen = 'importado'
FROM public.gasto_categorias c
WHERE g.categoria_id IS NULL
  AND g.categoria IS NOT NULL
  AND lower(btrim(g.categoria)) = lower(c.nombre);

-- =========================================================
-- 3) REGLAS DE CATEGORIZACIÓN AUTOMÁTICA
-- =========================================================
CREATE TABLE public.gasto_reglas_categoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text,
  campo text NOT NULL DEFAULT 'texto',
  patron text NOT NULL,
  categoria_id uuid NOT NULL REFERENCES public.gasto_categorias(id) ON DELETE CASCADE,
  prioridad integer NOT NULL DEFAULT 100,
  activa boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gasto_reglas_campo_chk CHECK (campo IN ('texto', 'descripcion', 'proveedor'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gasto_reglas_categoria TO authenticated;
GRANT ALL ON public.gasto_reglas_categoria TO service_role;
ALTER TABLE public.gasto_reglas_categoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gasto_reglas_read" ON public.gasto_reglas_categoria
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "gasto_reglas_admin" ON public.gasto_reglas_categoria
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER gasto_reglas_updated_at
  BEFORE UPDATE ON public.gasto_reglas_categoria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.gastos
  ADD CONSTRAINT gastos_categoria_regla_fk
  FOREIGN KEY (categoria_regla_id) REFERENCES public.gasto_reglas_categoria(id) ON DELETE SET NULL;

-- Matcher: devuelve (categoria_id, regla_id) para un texto
CREATE OR REPLACE FUNCTION public.match_gasto_categoria(_descripcion text, _proveedor text DEFAULT NULL)
RETURNS TABLE (categoria_id uuid, regla_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.categoria_id, r.id
  FROM public.gasto_reglas_categoria r
  JOIN public.gasto_categorias c ON c.id = r.categoria_id
  WHERE r.activa
    AND c.activa
    AND c.archivada_at IS NULL
    AND (
      (r.campo = 'descripcion' AND coalesce(_descripcion, '') ILIKE '%' || r.patron || '%')
      OR (r.campo = 'proveedor' AND coalesce(_proveedor, '') ILIKE '%' || r.patron || '%')
      OR (r.campo = 'texto' AND (coalesce(_descripcion, '') || ' ' || coalesce(_proveedor, '')) ILIKE '%' || r.patron || '%')
    )
  ORDER BY r.prioridad ASC, r.created_at ASC
  LIMIT 1;
$$;

-- Trigger: aplica reglas al crear un gasto. Nunca pisa una elección manual.
CREATE OR REPLACE FUNCTION public.gastos_autocategorizar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat uuid;
  v_regla uuid;
BEGIN
  IF NEW.categoria_origen = 'manual' THEN
    RETURN NEW;
  END IF;

  IF NEW.categoria_id IS NULL AND NEW.categoria IS NOT NULL THEN
    SELECT c.id INTO NEW.categoria_id
    FROM public.gasto_categorias c
    WHERE lower(c.nombre) = lower(btrim(NEW.categoria));
  END IF;

  IF NEW.categoria_id IS NULL THEN
    SELECT m.categoria_id, m.regla_id INTO v_cat, v_regla
    FROM public.match_gasto_categoria(NEW.descripcion, NEW.proveedor) m;

    IF v_cat IS NOT NULL THEN
      NEW.categoria_id := v_cat;
      NEW.categoria_regla_id := v_regla;
      NEW.categoria_origen := 'regla';
      NEW.categoria_asignada_at := now();
    ELSE
      SELECT c.id INTO NEW.categoria_id
      FROM public.gasto_categorias c WHERE lower(c.nombre) = 'por categorizar';
      NEW.categoria_origen := 'sin_categoria';
    END IF;

    IF NEW.categoria IS NULL OR btrim(NEW.categoria) = '' THEN
      SELECT c.nombre INTO NEW.categoria FROM public.gasto_categorias c WHERE c.id = NEW.categoria_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER gastos_autocategorizar_trg
  BEFORE INSERT ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.gastos_autocategorizar();

-- Corrección manual (protegida de reglas futuras) + regla opcional
CREATE OR REPLACE FUNCTION public.set_gasto_categoria(
  _gasto_id uuid,
  _categoria_id uuid,
  _crear_regla boolean DEFAULT false,
  _patron text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre text;
  v_regla uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  SELECT nombre INTO v_nombre FROM public.gasto_categorias WHERE id = _categoria_id;
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'CATEGORIA_INEXISTENTE';
  END IF;

  IF _crear_regla AND _patron IS NOT NULL AND btrim(_patron) <> '' THEN
    INSERT INTO public.gasto_reglas_categoria (nombre, campo, patron, categoria_id, prioridad, created_by)
    VALUES (btrim(_patron) || ' → ' || v_nombre, 'texto', btrim(_patron), _categoria_id, 50, auth.uid())
    RETURNING id INTO v_regla;
  END IF;

  UPDATE public.gastos
  SET categoria_id = _categoria_id,
      categoria = v_nombre,
      categoria_origen = 'manual',
      categoria_asignada_at = now(),
      categoria_asignada_por = auth.uid()
  WHERE id = _gasto_id;

  RETURN v_regla;
END;
$$;

-- Borrado seguro: sólo si nunca se usó; si no, se archiva
CREATE OR REPLACE FUNCTION public.eliminar_gasto_categoria(_categoria_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usos integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  SELECT count(*) INTO v_usos FROM public.gastos WHERE categoria_id = _categoria_id;

  IF v_usos = 0 THEN
    DELETE FROM public.gasto_reglas_categoria WHERE categoria_id = _categoria_id;
    DELETE FROM public.gasto_categorias WHERE id = _categoria_id;
    RETURN 'eliminada';
  END IF;

  UPDATE public.gasto_categorias
  SET activa = false, archivada_at = now()
  WHERE id = _categoria_id;
  UPDATE public.gasto_reglas_categoria SET activa = false WHERE categoria_id = _categoria_id;
  RETURN 'archivada';
END;
$$;

-- =========================================================
-- 4) TRANSFERENCIAS A PROFESORES
-- =========================================================
CREATE TABLE public.coach_mp_contrapartes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  mp_collector_id text,
  alias text,
  nombre_contraparte text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX coach_mp_contrapartes_collector_uidx
  ON public.coach_mp_contrapartes (mp_collector_id) WHERE mp_collector_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_mp_contrapartes TO authenticated;
GRANT ALL ON public.coach_mp_contrapartes TO service_role;
ALTER TABLE public.coach_mp_contrapartes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_mp_contrapartes_admin" ON public.coach_mp_contrapartes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER coach_mp_contrapartes_updated_at
  BEFORE UPDATE ON public.coach_mp_contrapartes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.mp_account_movements
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coach_match_estado text,
  ADD COLUMN IF NOT EXISTS coach_match_confirmado_por uuid,
  ADD COLUMN IF NOT EXISTS coach_match_confirmado_at timestamptz,
  ADD COLUMN IF NOT EXISTS liquidacion_id uuid REFERENCES public.liquidaciones_mensuales(id) ON DELETE SET NULL;

ALTER TABLE public.mp_account_movements
  ADD CONSTRAINT mp_coach_match_estado_chk
  CHECK (coach_match_estado IS NULL OR coach_match_estado IN ('sugerido', 'confirmado', 'descartado'));

-- Sugerencias conservadoras: sólo por contraparte MP mapeada explícitamente
CREATE OR REPLACE VIEW public.vw_posibles_pagos_profesor AS
SELECT
  m.id AS movement_id,
  m.mp_payment_id,
  m.amount,
  m.currency,
  m.fecha_movimiento,
  m.description,
  m.gasto_id,
  m.coach_id AS coach_vinculado,
  m.coach_match_estado,
  cmc.coach_id AS coach_sugerido,
  co.nombre AS coach_sugerido_nombre
FROM public.mp_account_movements m
LEFT JOIN public.coach_mp_contrapartes cmc
  ON cmc.mp_collector_id IS NOT NULL
 AND cmc.mp_collector_id = (m.raw -> 'collector' ->> 'id')
LEFT JOIN public.coaches co ON co.id = cmc.coach_id
WHERE m.direccion = 'egreso'
  AND m.status = 'approved'
  AND (m.coach_id IS NOT NULL OR cmc.coach_id IS NOT NULL);

GRANT SELECT ON public.vw_posibles_pagos_profesor TO authenticated;
GRANT SELECT ON public.vw_posibles_pagos_profesor TO service_role;

CREATE OR REPLACE FUNCTION public.vincular_egreso_mp_coach(
  _movement_id uuid,
  _coach_id uuid,
  _confirmar boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gasto uuid;
  v_cat uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  UPDATE public.mp_account_movements
  SET coach_id = _coach_id,
      coach_match_estado = CASE WHEN _confirmar THEN 'confirmado' ELSE 'sugerido' END,
      coach_match_confirmado_por = CASE WHEN _confirmar THEN auth.uid() ELSE NULL END,
      coach_match_confirmado_at = CASE WHEN _confirmar THEN now() ELSE NULL END
  WHERE id = _movement_id
  RETURNING gasto_id INTO v_gasto;

  IF _confirmar AND v_gasto IS NOT NULL THEN
    SELECT id INTO v_cat FROM public.gasto_categorias
    WHERE lower(nombre) = 'profesores / liquidaciones';
    IF v_cat IS NOT NULL THEN
      UPDATE public.gastos
      SET categoria_id = v_cat,
          categoria = 'Profesores / Liquidaciones',
          categoria_origen = 'manual',
          categoria_asignada_at = now(),
          categoria_asignada_por = auth.uid()
      WHERE id = v_gasto AND categoria_origen <> 'manual';
    END IF;
  END IF;
END;
$$;

-- =========================================================
-- 5) RESUMEN SIMPLE DEL MES
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_resumen_financiero_mes(
  _mes date,
  _moneda text DEFAULT 'ARS'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ini date := date_trunc('month', _mes)::date;
  v_fin date := (date_trunc('month', _mes) + interval '1 month')::date;
  v_mes_txt text := to_char(_mes, 'YYYY-MM');
  v_entro numeric := 0;
  v_salio_gastos numeric := 0;
  v_salio_mp numeric := 0;
  v_cobrar_mes numeric := 0;
  v_cobrar_prev numeric := 0;
  v_pagar numeric := 0;
  v_pagar_filas integer := 0;
  v_liq_total integer := 0;
  v_liq_pend numeric := 0;
  v_desglose jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  -- ENTRÓ: sólo movimientos MP aprobados de ingreso (sin facturas, ajustes ni imputaciones)
  SELECT coalesce(sum(m.amount), 0) INTO v_entro
  FROM public.mp_account_movements m
  WHERE m.direccion = 'ingreso'
    AND m.status = 'approved'
    AND m.currency = _moneda
    AND m.fecha_movimiento >= v_ini AND m.fecha_movimiento < v_fin;

  -- Desglose por unidad, usando el vínculo directo del movimiento (sin fan-out)
  SELECT jsonb_object_agg(unidad, total) INTO v_desglose
  FROM (
    SELECT
      CASE
        WHEN m.suscripcion_id IS NOT NULL THEN 'escuela'
        WHEN m.reservation_payment_id IS NOT NULL OR m.external_reference LIKE 'event:%' THEN 'viajes'
        WHEN m.external_reference LIKE 'turnera:%' THEN 'personalizadas'
        WHEN m.external_reference LIKE 'store%' OR m.external_reference LIKE 'order:%'
          OR m.external_reference LIKE 'preorder%' OR m.external_reference LIKE 'pedido%' THEN 'tienda'
        ELSE 'sin_identificar'
      END AS unidad,
      sum(m.amount) AS total
    FROM public.mp_account_movements m
    WHERE m.direccion = 'ingreso'
      AND m.status = 'approved'
      AND m.currency = _moneda
      AND m.fecha_movimiento >= v_ini AND m.fecha_movimiento < v_fin
    GROUP BY 1
  ) d;

  -- SALIÓ: gastos del mes + egresos MP del mes que todavía no son gasto (nunca ambos)
  SELECT coalesce(sum(g.monto), 0) INTO v_salio_gastos
  FROM public.gastos g
  WHERE coalesce(g.moneda, 'ARS') = _moneda
    AND g.fecha >= v_ini AND g.fecha < v_fin;

  SELECT coalesce(sum(m.amount), 0) INTO v_salio_mp
  FROM public.mp_account_movements m
  WHERE m.direccion = 'egreso'
    AND m.status = 'approved'
    AND m.gasto_id IS NULL
    AND m.currency = _moneda
    AND m.fecha_movimiento >= v_ini AND m.fecha_movimiento < v_fin;

  -- FALTA COBRAR
  SELECT
    coalesce(sum(v.amount) FILTER (WHERE v.due_date >= v_ini AND v.due_date < v_fin), 0),
    coalesce(sum(v.amount) FILTER (WHERE v.due_date < v_ini), 0)
  INTO v_cobrar_mes, v_cobrar_prev
  FROM public.vw_pagos_por_cobrar v
  WHERE coalesce(v.currency, 'ARS') = _moneda;

  -- FALTA PAGAR: compromisos realmente modelados
  SELECT coalesce(sum(e.monto_previsto - coalesce(e.monto_pagado, 0)), 0), count(*)
  INTO v_pagar, v_pagar_filas
  FROM public.gastos_ejecuciones e
  WHERE e.mes = v_mes_txt
    AND coalesce(e.moneda, 'ARS') = _moneda
    AND e.estado IN ('pendiente', 'vencido', 'parcial');

  SELECT count(*), coalesce(sum(coalesce(l.total_confirmado, l.total_estimado, 0) - coalesce(l.total_pagado, 0)), 0)
  INTO v_liq_total, v_liq_pend
  FROM public.liquidaciones_mensuales l
  WHERE l.mes = v_mes_txt;

  RETURN jsonb_build_object(
    'mes', v_mes_txt,
    'moneda', _moneda,
    'entro', v_entro,
    'desglose', coalesce(v_desglose, '{}'::jsonb),
    'falta_cobrar_mes', v_cobrar_mes,
    'vencido_de_antes', v_cobrar_prev,
    'salio', v_salio_gastos + v_salio_mp,
    'salio_gastos', v_salio_gastos,
    'salio_mp_sin_gasto', v_salio_mp,
    'falta_pagar', CASE WHEN v_pagar_filas = 0 AND v_liq_total = 0 THEN NULL ELSE v_pagar + v_liq_pend END,
    'falta_pagar_filas', v_pagar_filas,
    'liquidaciones_generadas', v_liq_total > 0,
    'liquidaciones_pendientes', v_liq_pend
  );
END;
$$;