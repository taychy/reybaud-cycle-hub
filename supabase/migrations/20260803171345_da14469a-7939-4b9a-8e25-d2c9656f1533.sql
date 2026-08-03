CREATE TABLE public.vehiculo_chequeos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carga_id uuid NOT NULL REFERENCES public.vehiculo_cargas(id) ON DELETE CASCADE,
  ronda integer NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('inicial','control')),
  estado text NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso','cerrado')),
  responsable_user_id uuid,
  responsable_nombre text,
  notas text,
  resumen jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (carga_id, ronda)
);

CREATE TABLE public.vehiculo_chequeo_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chequeo_id uuid NOT NULL REFERENCES public.vehiculo_chequeos(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.vehiculo_carga_items(id) ON DELETE CASCADE,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  scanned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chequeo_id, item_id)
);

CREATE INDEX vehiculo_chequeos_carga_idx ON public.vehiculo_chequeos(carga_id);
CREATE INDEX vehiculo_chequeo_scans_chequeo_idx ON public.vehiculo_chequeo_scans(chequeo_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehiculo_chequeos TO authenticated;
GRANT ALL ON public.vehiculo_chequeos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehiculo_chequeo_scans TO authenticated;
GRANT ALL ON public.vehiculo_chequeo_scans TO service_role;

ALTER TABLE public.vehiculo_chequeos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculo_chequeo_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deposito y admin gestionan chequeos"
ON public.vehiculo_chequeos FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role));

CREATE POLICY "Deposito y admin gestionan chequeo scans"
ON public.vehiculo_chequeo_scans FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role));

CREATE TRIGGER update_vehiculo_chequeos_updated_at
BEFORE UPDATE ON public.vehiculo_chequeos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inicia (o retoma) una ronda de chequeo para una carga
CREATE OR REPLACE FUNCTION public.start_vehiculo_chequeo(_carga_id uuid, _responsable_nombre text DEFAULT NULL)
RETURNS public.vehiculo_chequeos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.vehiculo_chequeos;
  v_next integer;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_row FROM public.vehiculo_chequeos
  WHERE carga_id = _carga_id AND estado = 'en_curso'
  ORDER BY ronda DESC LIMIT 1;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT COALESCE(MAX(ronda), 0) + 1 INTO v_next FROM public.vehiculo_chequeos WHERE carga_id = _carga_id;

  INSERT INTO public.vehiculo_chequeos (carga_id, ronda, tipo, responsable_user_id, responsable_nombre)
  VALUES (_carga_id, v_next, CASE WHEN v_next = 1 THEN 'inicial' ELSE 'control' END, auth.uid(), NULLIF(_responsable_nombre, ''))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Compara la ronda actual contra la ronda anterior y contra lo informado por el entregador
CREATE OR REPLACE FUNCTION public.get_vehiculo_chequeo_diff(_chequeo_id uuid)
RETURNS TABLE (
  item_id uuid,
  cliente_nombre text,
  producto text,
  variante text,
  cantidad numeric,
  source_table text,
  en_base boolean,
  escaneado boolean,
  informado_entregado boolean,
  resultado text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga uuid;
  v_ronda integer;
  v_prev uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT c.carga_id, c.ronda INTO v_carga, v_ronda FROM public.vehiculo_chequeos c WHERE c.id = _chequeo_id;
  IF v_carga IS NULL THEN RETURN; END IF;

  SELECT c.id INTO v_prev FROM public.vehiculo_chequeos c
  WHERE c.carga_id = v_carga AND c.ronda < v_ronda AND c.estado = 'cerrado'
  ORDER BY c.ronda DESC LIMIT 1;

  RETURN QUERY
  WITH base AS (
    SELECT i.id
    FROM public.vehiculo_carga_items i
    WHERE i.carga_id = v_carga
      AND (
        (v_prev IS NULL AND i.estado = 'cargado')
        OR (v_prev IS NOT NULL AND EXISTS (SELECT 1 FROM public.vehiculo_chequeo_scans s WHERE s.chequeo_id = v_prev AND s.item_id = i.id))
      )
  ),
  scans AS (
    SELECT s.item_id FROM public.vehiculo_chequeo_scans s WHERE s.chequeo_id = _chequeo_id
  ),
  info AS (
    SELECT i.id,
      COALESCE(
        CASE
          WHEN i.estado = 'entregado' THEN true
          WHEN i.source_table = 'delivery_list_items' THEN (SELECT d.preparado FROM public.delivery_list_items d WHERE d.id = i.source_id)
          WHEN i.source_table = 'store_order_items' THEN (
            SELECT o.status = 'entregado' FROM public.store_order_items oi
            JOIN public.store_orders o ON o.id = oi.order_id WHERE oi.id = i.source_id
          )
          WHEN i.source_table = 'pedidos_externos' THEN (SELECT p.estado = 'entregado' FROM public.pedidos_externos p WHERE p.id = i.source_id)
          ELSE false
        END, false) AS informado
    FROM public.vehiculo_carga_items i
    WHERE i.carga_id = v_carga
  )
  SELECT
    i.id,
    i.cliente_nombre,
    i.producto,
    i.variante,
    i.cantidad,
    i.source_table,
    (b.id IS NOT NULL) AS en_base,
    (sc.item_id IS NOT NULL) AS escaneado,
    inf.informado,
    CASE
      WHEN sc.item_id IS NOT NULL AND inf.informado THEN 'entregado_pero_presente'
      WHEN sc.item_id IS NOT NULL AND b.id IS NULL THEN 'nuevo'
      WHEN sc.item_id IS NOT NULL THEN 'presente'
      WHEN b.id IS NOT NULL AND inf.informado THEN 'entregado_ok'
      WHEN b.id IS NOT NULL THEN 'faltante_sin_aviso'
      ELSE 'fuera_de_ronda'
    END AS resultado
  FROM public.vehiculo_carga_items i
  LEFT JOIN base b ON b.id = i.id
  LEFT JOIN scans sc ON sc.item_id = i.id
  LEFT JOIN info inf ON inf.id = i.id
  WHERE i.carga_id = v_carga
  ORDER BY i.cliente_nombre, i.producto;
END;
$$;

-- Cierra la ronda: aplica estados y guarda el resumen
CREATE OR REPLACE FUNCTION public.close_vehiculo_chequeo(_chequeo_id uuid, _notas text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resumen jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  CREATE TEMP TABLE _diff ON COMMIT DROP AS
  SELECT * FROM public.get_vehiculo_chequeo_diff(_chequeo_id);

  UPDATE public.vehiculo_carga_items i
  SET estado = 'entregado', entregado_at = COALESCE(i.entregado_at, now())
  FROM _diff d
  WHERE d.item_id = i.id AND d.resultado = 'entregado_ok' AND i.estado <> 'entregado';

  UPDATE public.vehiculo_carga_items i
  SET estado = 'faltante'
  FROM _diff d
  WHERE d.item_id = i.id AND d.resultado = 'faltante_sin_aviso' AND i.estado = 'cargado';

  UPDATE public.vehiculo_carga_items i
  SET chequeado_at = now(), chequeado_by = auth.uid()
  FROM _diff d
  WHERE d.item_id = i.id AND d.escaneado;

  SELECT jsonb_build_object(
    'presente', COUNT(*) FILTER (WHERE resultado = 'presente'),
    'nuevo', COUNT(*) FILTER (WHERE resultado = 'nuevo'),
    'entregado_ok', COUNT(*) FILTER (WHERE resultado = 'entregado_ok'),
    'faltante_sin_aviso', COUNT(*) FILTER (WHERE resultado = 'faltante_sin_aviso'),
    'entregado_pero_presente', COUNT(*) FILTER (WHERE resultado = 'entregado_pero_presente')
  ) INTO v_resumen FROM _diff;

  UPDATE public.vehiculo_chequeos
  SET estado = 'cerrado', closed_at = now(), notas = COALESCE(NULLIF(_notas, ''), notas), resumen = v_resumen
  WHERE id = _chequeo_id;

  RETURN v_resumen;
END;
$$;