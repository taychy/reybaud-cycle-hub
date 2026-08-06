-- 1) Tabla de pedidos de vinculación de email
CREATE TABLE public.alumno_email_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  nuevo_email text NOT NULL,
  token text NOT NULL UNIQUE,
  motivo text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alumno_email_links_estado_chk CHECK (estado IN ('pendiente','confirmado','expirado','cancelado'))
);

CREATE INDEX idx_alumno_email_links_alumno ON public.alumno_email_links(alumno_id);
CREATE INDEX idx_alumno_email_links_email ON public.alumno_email_links(lower(nuevo_email));

GRANT SELECT ON public.alumno_email_links TO authenticated;
GRANT ALL ON public.alumno_email_links TO service_role;

ALTER TABLE public.alumno_email_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins ven pedidos de vinculacion"
ON public.alumno_email_links FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_alumno_email_links_updated_at
BEFORE UPDATE ON public.alumno_email_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Detección de duplicados incluyendo emails secundarios
CREATE OR REPLACE FUNCTION public.lookup_alumno_duplicate(
  p_email text DEFAULT NULL,
  p_telefono text DEFAULT NULL,
  p_documento text DEFAULT NULL
)
RETURNS TABLE (motivo text, nombre_parcial text, email_enmascarado text, estado text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH norm AS (
    SELECT
      lower(btrim(coalesce(p_email, ''))) AS em,
      right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10) AS tel,
      regexp_replace(coalesce(p_documento, ''), '\D', '', 'g') AS doc
  )
  SELECT
    CASE
      WHEN n.em <> '' AND lower(btrim(a.email)) = n.em THEN 'email'
      WHEN n.em <> '' AND EXISTS (
        SELECT 1 FROM unnest(a.emails_adicionales) e WHERE lower(btrim(e)) = n.em
      ) THEN 'email_secundario'
      WHEN n.doc <> '' AND regexp_replace(coalesce(a.documento, ''), '\D', '', 'g') = n.doc THEN 'documento'
      ELSE 'telefono'
    END AS motivo,
    btrim(split_part(a.nombre, ' ', 1)) || ' ' || left(coalesce(a.apellido, ''), 1) || '.' AS nombre_parcial,
    left(split_part(a.email, '@', 1), 2) || '***@' || split_part(a.email, '@', 2) AS email_enmascarado,
    a.estado::text
  FROM public.alumnos a, norm n
  WHERE a.fusionada_en IS NULL
    AND (
      (n.em <> '' AND lower(btrim(a.email)) = n.em)
      OR (n.em <> '' AND EXISTS (
            SELECT 1 FROM unnest(a.emails_adicionales) e WHERE lower(btrim(e)) = n.em))
      OR (length(n.tel) = 10 AND right(regexp_replace(coalesce(a.telefono, ''), '\D', '', 'g'), 10) = n.tel)
      OR (length(n.doc) >= 7 AND regexp_replace(coalesce(a.documento, ''), '\D', '', 'g') = n.doc)
    )
  LIMIT 5;
$$;

-- 3) Crear pedido de vinculación (usada por el backend de emails)
CREATE OR REPLACE FUNCTION public.request_alumno_email_link(
  p_nuevo_email text,
  p_telefono text DEFAULT NULL,
  p_documento text DEFAULT NULL
)
RETURNS TABLE (
  token text,
  alumno_id uuid,
  destino_email text,
  destino_enmascarado text,
  nombre_completo text,
  motivo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_nuevo_email, '')));
  v_tel text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10);
  v_doc text := regexp_replace(coalesce(p_documento, ''), '\D', '', 'g');
  v_a public.alumnos%ROWTYPE;
  v_motivo text;
  v_token text;
BEGIN
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'Email inválido';
  END IF;

  -- El email nuevo no puede ya pertenecer a otra ficha
  IF EXISTS (
    SELECT 1 FROM public.alumnos a
    WHERE lower(btrim(a.email)) = v_email
       OR EXISTS (SELECT 1 FROM unnest(a.emails_adicionales) e WHERE lower(btrim(e)) = v_email)
  ) THEN
    RAISE EXCEPTION 'Ese email ya está registrado';
  END IF;

  -- Coincidencia sólo por documento o teléfono (nunca por nombre)
  IF length(v_doc) >= 7 THEN
    SELECT * INTO v_a FROM public.alumnos a
    WHERE a.fusionada_en IS NULL
      AND regexp_replace(coalesce(a.documento, ''), '\D', '', 'g') = v_doc
    ORDER BY a.created_at LIMIT 1;
    IF FOUND THEN v_motivo := 'documento'; END IF;
  END IF;

  IF v_a.id IS NULL AND length(v_tel) = 10 THEN
    SELECT * INTO v_a FROM public.alumnos a
    WHERE a.fusionada_en IS NULL
      AND right(regexp_replace(coalesce(a.telefono, ''), '\D', '', 'g'), 10) = v_tel
    ORDER BY a.created_at LIMIT 1;
    IF FOUND THEN v_motivo := 'telefono'; END IF;
  END IF;

  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos una ficha con esos datos';
  END IF;

  UPDATE public.alumno_email_links
  SET estado = 'cancelado'
  WHERE alumno_id = v_a.id AND lower(nuevo_email) = v_email AND estado = 'pendiente';

  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.alumno_email_links (alumno_id, nuevo_email, token, motivo)
  VALUES (v_a.id, v_email, v_token, v_motivo);

  RETURN QUERY SELECT
    v_token,
    v_a.id,
    v_a.email,
    left(split_part(v_a.email, '@', 1), 2) || '***@' || split_part(v_a.email, '@', 2),
    btrim(coalesce(v_a.nombre, '') || ' ' || coalesce(v_a.apellido, '')),
    v_motivo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_alumno_email_link(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_alumno_email_link(text, text, text) TO service_role;

-- 4) Confirmar la vinculación con el token del email
CREATE OR REPLACE FUNCTION public.confirm_alumno_email_link(p_token text)
RETURNS TABLE (ok boolean, mensaje text, nombre_completo text, email_principal text, email_vinculado text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.alumno_email_links%ROWTYPE;
  v_a public.alumnos%ROWTYPE;
BEGIN
  SELECT * INTO v_link FROM public.alumno_email_links WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Enlace inválido'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_link.estado = 'confirmado' THEN
    SELECT * INTO v_a FROM public.alumnos WHERE id = v_link.alumno_id;
    RETURN QUERY SELECT true, 'Este email ya estaba vinculado a tu ficha'::text,
      btrim(coalesce(v_a.nombre,'') || ' ' || coalesce(v_a.apellido,'')), v_a.email, v_link.nuevo_email;
    RETURN;
  END IF;

  IF v_link.estado <> 'pendiente' OR v_link.expires_at < now() THEN
    UPDATE public.alumno_email_links SET estado = 'expirado'
    WHERE id = v_link.id AND estado = 'pendiente';
    RETURN QUERY SELECT false, 'El enlace venció. Pedí uno nuevo desde el registro.'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.alumnos a
    WHERE lower(btrim(a.email)) = lower(v_link.nuevo_email)
       OR EXISTS (SELECT 1 FROM unnest(a.emails_adicionales) e WHERE lower(btrim(e)) = lower(v_link.nuevo_email))
  ) THEN
    UPDATE public.alumno_email_links SET estado = 'cancelado' WHERE id = v_link.id;
    RETURN QUERY SELECT false, 'Ese email ya está registrado en el sistema'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  UPDATE public.alumnos
  SET emails_adicionales = array_append(emails_adicionales, lower(v_link.nuevo_email)),
      updated_at = now()
  WHERE id = v_link.alumno_id
  RETURNING * INTO v_a;

  UPDATE public.alumno_email_links
  SET estado = 'confirmado', confirmed_at = now()
  WHERE id = v_link.id;

  INSERT INTO public.audit_log (action, table_name, record_id, details)
  VALUES (
    'vincular_email_secundario',
    'alumnos',
    v_a.id,
    jsonb_build_object('nuevo_email', lower(v_link.nuevo_email), 'motivo', v_link.motivo, 'link_id', v_link.id)
  );

  RETURN QUERY SELECT true, 'Email vinculado correctamente'::text,
    btrim(coalesce(v_a.nombre,'') || ' ' || coalesce(v_a.apellido,'')), v_a.email, lower(v_link.nuevo_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_alumno_email_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_alumno_email_link(text) TO anon, authenticated, service_role;