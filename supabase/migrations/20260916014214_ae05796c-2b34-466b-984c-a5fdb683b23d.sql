ALTER TABLE public.vehiculo_chequeo_scans
  ADD COLUMN IF NOT EXISTS cantidad_vista integer NOT NULL DEFAULT 0;

ALTER TABLE public.vehiculo_chequeo_scans
  DROP CONSTRAINT IF EXISTS vehiculo_chequeo_scans_cantidad_vista_check;
ALTER TABLE public.vehiculo_chequeo_scans
  ADD CONSTRAINT vehiculo_chequeo_scans_cantidad_vista_check CHECK (cantidad_vista >= 0);

-- Líneas del chequeo físico simple: lo que el sistema dice que está en camioneta
CREATE OR REPLACE FUNCTION public.get_vehiculo_chequeo_lineas(_chequeo_id uuid)
RETURNS TABLE (
  item_id uuid,
  cliente_nombre text,
  producto text,
  variante text,
  esperado numeric,
  visto integer,
  registrado boolean,
  registrado_por uuid,
  registrado_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT c.carga_id INTO v_carga FROM public.vehiculo_chequeos c WHERE c.id = _chequeo_id;
  IF v_carga IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.cliente_nombre,
    i.producto,
    i.variante,
    i.cantidad,
    s.cantidad_vista,
    (s.id IS NOT NULL) AS registrado,
    s.scanned_by,
    s.scanned_at
  FROM public.vehiculo_carga_items i
  LEFT JOIN public.vehiculo_chequeo_scans s
    ON s.chequeo_id = _chequeo_id AND s.item_id = i.id
  WHERE i.carga_id = v_carga
    AND (i.estado = 'cargado' OR s.id IS NOT NULL)
  ORDER BY i.cliente_nombre, i.producto;
END;
$$;

-- Cierre SOLO observacional: guarda la foto de lo visto y el resumen.
CREATE OR REPLACE FUNCTION public.close_vehiculo_chequeo_observacional(_chequeo_id uuid, _notas text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resumen jsonb;
  v_sin_registrar integer;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COUNT(*) INTO v_sin_registrar
  FROM public.get_vehiculo_chequeo_lineas(_chequeo_id) l
  WHERE NOT l.registrado;

  IF v_sin_registrar > 0 THEN
    RAISE EXCEPTION 'Quedan % línea(s) sin registrar', v_sin_registrar;
  END IF;

  SELECT jsonb_build_object(
    'lineas', COUNT(*),
    'lineas_registradas', COUNT(*) FILTER (WHERE l.registrado),
    'esperado', COALESCE(SUM(l.esperado), 0),
    'visto', COALESCE(SUM(l.visto), 0),
    'faltantes', COALESCE(SUM(GREATEST(l.esperado - l.visto, 0)), 0),
    'sobrantes', COALESCE(SUM(GREATEST(l.visto - l.esperado, 0)), 0)
  ) INTO v_resumen
  FROM public.get_vehiculo_chequeo_lineas(_chequeo_id) l;

  UPDATE public.vehiculo_chequeos
  SET estado = 'cerrado',
      closed_at = now(),
      notas = COALESCE(NULLIF(_notas, ''), notas),
      resumen = v_resumen
  WHERE id = _chequeo_id AND estado = 'en_curso';

  RETURN v_resumen;
END;
$$;