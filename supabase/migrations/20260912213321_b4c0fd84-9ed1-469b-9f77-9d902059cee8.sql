-- =========================================================
-- Validación de identidad fiscal antes de emitir facturas
-- =========================================================

-- Limpia un documento: devuelve sólo dígitos SI el valor es "limpio"
-- (dígitos + separadores típicos). Si trae letras, URLs, texto entre
-- paréntesis, etc., devuelve NULL (no se extrae mágicamente un número).
CREATE OR REPLACE FUNCTION public.fiscal_doc_digits(p_doc text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_doc IS NULL THEN NULL
    WHEN btrim(p_doc) = '' THEN NULL
    WHEN btrim(p_doc) ~ '^[0-9][0-9 .\-]*$' THEN regexp_replace(p_doc, '[^0-9]', '', 'g')
    ELSE NULL
  END;
$$;

-- Dígito verificador de CUIT (módulo 11).
CREATE OR REPLACE FUNCTION public.fiscal_cuit_valido(p_doc text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text := public.fiscal_doc_digits(p_doc);
  w int[] := ARRAY[5,4,3,2,7,6,5,4,3,2];
  s int := 0;
  i int;
  dv int;
BEGIN
  IF d IS NULL OR length(d) <> 11 THEN
    RETURN false;
  END IF;
  FOR i IN 1..10 LOOP
    s := s + (substr(d, i, 1))::int * w[i];
  END LOOP;
  dv := 11 - (s % 11);
  IF dv = 11 THEN dv := 0; END IF;
  IF dv = 10 THEN RETURN false; END IF;
  RETURN dv = (substr(d, 11, 1))::int;
END;
$$;

-- Clasificación fiscal de un documento. NO corrige ni inventa datos.
-- clase: ok | documento_faltante | documento_invalido
-- doc_tipo AFIP: 80 = CUIT, 96 = DNI
CREATE OR REPLACE FUNCTION public.clasificar_documento_fiscal(p_doc text, p_tipo_documento text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text := public.fiscal_doc_digits(p_doc);
  declarado text := lower(btrim(coalesce(p_tipo_documento, '')));
BEGIN
  IF p_doc IS NULL OR btrim(p_doc) = '' THEN
    RETURN jsonb_build_object('clase','documento_faltante','doc_tipo',NULL,'doc_nro',NULL,
      'inconsistente',false,'mensaje','Falta completar DNI o CUIT en la ficha del cliente');
  END IF;

  IF d IS NULL THEN
    RETURN jsonb_build_object('clase','documento_invalido','doc_tipo',NULL,'doc_nro',NULL,
      'inconsistente',false,'mensaje','El documento cargado no es un número válido (contiene texto o caracteres inválidos)');
  END IF;

  IF length(d) = 11 THEN
    IF public.fiscal_cuit_valido(d) THEN
      RETURN jsonb_build_object('clase','ok','doc_tipo',80,'doc_nro',d,
        'inconsistente', (declarado <> '' AND declarado NOT LIKE '%cuit%' AND declarado NOT LIKE '%cuil%'),
        'mensaje', NULL);
    END IF;
    RETURN jsonb_build_object('clase','documento_invalido','doc_tipo',NULL,'doc_nro',NULL,
      'inconsistente',false,'mensaje','CUIT de 11 dígitos con dígito verificador inválido');
  END IF;

  IF length(d) IN (7,8) THEN
    RETURN jsonb_build_object('clase','ok','doc_tipo',96,'doc_nro',d,
      'inconsistente', (declarado <> '' AND (declarado LIKE '%cuit%' OR declarado LIKE '%cuil%')),
      'mensaje', NULL);
  END IF;

  RETURN jsonb_build_object('clase','documento_invalido','doc_tipo',NULL,'doc_nro',NULL,
    'inconsistente',false,
    'mensaje', format('El documento tiene %s dígitos: no es un DNI (7 u 8) ni un CUIT (11)', length(d)));
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_doc_digits(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fiscal_cuit_valido(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clasificar_documento_fiscal(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_doc_digits(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_cuit_valido(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clasificar_documento_fiscal(text, text) TO authenticated, service_role;

-- =========================================================
-- Preflight de la cola pendiente
-- =========================================================
CREATE OR REPLACE FUNCTION public.preflight_facturacion_cola()
RETURNS TABLE (
  cola_id uuid,
  alumno_id uuid,
  cliente_nombre text,
  concepto text,
  monto numeric,
  segmento text,
  pagado_at timestamptz,
  documento_cola text,
  documento_actual text,
  tipo_documento text,
  nombre_fiscal text,
  clase text,
  doc_tipo int,
  doc_nro text,
  inconsistente boolean,
  mensaje text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT c.id, c.alumno_id, c.cliente_nombre, c.concepto, c.monto, c.segmento, c.pagado_at,
           c.cliente_cuit AS doc_cola,
           a.documento AS doc_actual,
           a.tipo_documento,
           a.nombre_fiscal
    FROM public.facturacion_cola c
    LEFT JOIN public.alumnos a ON a.id = c.alumno_id
    WHERE c.estado = 'pendiente'
  ), clasificado AS (
    SELECT b.*,
           COALESCE(b.doc_actual, b.doc_cola) AS doc_efectivo,
           public.clasificar_documento_fiscal(COALESCE(b.doc_actual, b.doc_cola), b.tipo_documento) AS c
    FROM base b
  )
  SELECT
    x.id, x.alumno_id, x.cliente_nombre, x.concepto, x.monto, x.segmento, x.pagado_at,
    x.doc_cola, x.doc_actual, x.tipo_documento, x.nombre_fiscal,
    CASE
      WHEN x.alumno_id IS NULL THEN 'cliente_sin_identidad'
      WHEN (x.c->>'clase') = 'ok' AND (x.c->>'inconsistente')::boolean THEN 'tipo_inconsistente'
      ELSE (x.c->>'clase')
    END AS clase,
    NULLIF(x.c->>'doc_tipo','')::int,
    x.c->>'doc_nro',
    COALESCE((x.c->>'inconsistente')::boolean, false),
    CASE
      WHEN x.alumno_id IS NULL THEN 'El cobro no está vinculado a una ficha de cliente'
      ELSE x.c->>'mensaje'
    END
  FROM clasificado x
  ORDER BY x.pagado_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.preflight_facturacion_cola() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preflight_facturacion_cola() TO authenticated, service_role;
