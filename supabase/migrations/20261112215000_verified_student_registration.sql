-- Registro inicial de alumnos: email verificado y creación transaccional,
-- sin fusiones ni cambios en fichas existentes. DESPLEGAR JUNTO CON EL FRONTEND,
-- después de validar las rutas públicas que utilizaban INSERT anónimo.
--
-- La vinculación de un email secundario es un flujo distinto y requiere
-- la confirmación desde la dirección principal registrada.

CREATE OR REPLACE FUNCTION public.register_verified_alumno(
  p_nombre text,
  p_apellido text,
  p_telefono text DEFAULT NULL,
  p_documento text DEFAULT NULL,
  p_tipo_documento text DEFAULT 'dni'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $registration$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_verified_at timestamptz;
  v_existing uuid;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_apellido text := btrim(coalesce(p_apellido, ''));
  v_telefono text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_phone_digits text;
  v_doc text;
  v_tipo text := lower(btrim(coalesce(p_tipo_documento, 'dni')));
  v_weights integer[] := ARRAY[5,4,3,2,7,6,5,4,3,2];
  v_sum integer := 0;
  v_digit integer;
  i integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debés verificar tu email para crear la cuenta' USING ERRCODE = '28000';
  END IF;

  SELECT lower(btrim(u.email)), u.email_confirmed_at
    INTO v_email, v_verified_at
    FROM auth.users u WHERE u.id = v_uid;

  IF v_email IS NULL OR v_verified_at IS NULL THEN
    RAISE EXCEPTION 'Email no verificado' USING ERRCODE = '28000';
  END IF;

  IF length(v_email) > 255 OR v_nombre = '' OR v_apellido = ''
     OR length(v_nombre) > 100 OR length(v_apellido) > 100
     OR length(coalesce(v_telefono, '')) > 32 THEN
    RAISE EXCEPTION 'Datos personales inválidos' USING ERRCODE = '22023';
  END IF;

  IF v_tipo NOT IN ('dni', 'cuit') THEN
    RAISE EXCEPTION 'Tipo de documento inválido' USING ERRCODE = '22023';
  END IF;

  IF nullif(btrim(coalesce(p_documento, '')), '') IS NOT NULL THEN
    IF btrim(p_documento) !~ '^[0-9 .-]+$' THEN
      RAISE EXCEPTION 'El documento contiene caracteres inválidos' USING ERRCODE = '22023';
    END IF;
    v_doc := regexp_replace(p_documento, '[^0-9]', '', 'g');
    IF (v_tipo = 'dni' AND length(v_doc) NOT IN (7, 8))
       OR (v_tipo = 'cuit' AND length(v_doc) <> 11) THEN
      RAISE EXCEPTION 'Formato de documento inválido' USING ERRCODE = '22023';
    END IF;
    IF v_tipo = 'cuit' THEN
      FOR i IN 1..10 LOOP
        v_sum := v_sum + substr(v_doc, i, 1)::integer * v_weights[i];
      END LOOP;
      v_digit := 11 - (v_sum % 11);
      IF v_digit = 11 THEN v_digit := 0; END IF;
      IF v_digit = 10 OR v_digit <> substr(v_doc, 11, 1)::integer THEN
        RAISE EXCEPTION 'CUIT/CUIL inválido' USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  v_phone_digits := regexp_replace(coalesce(v_telefono, ''), '[^0-9]', '', 'g');
  IF length(v_phone_digits) > 10 THEN
    v_phone_digits := right(v_phone_digits, 10);
  END IF;

  -- El registro es infrecuente. Un único bloqueo transaccional evita carreras
  -- entre dos envíos simultáneos de este RPC (y conserva IDs existentes).
  PERFORM pg_catalog.pg_advisory_xact_lock(2026111201::bigint);

  v_existing := public.current_alumno_id();
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'existing', 'alumno_id', v_existing);
  END IF;

  -- El email verificado o una identidad Auth previa siempre gana.
  SELECT a.id INTO v_existing
    FROM public.alumnos a
   WHERE a.fusionada_en IS NULL
     AND (a.user_id = v_uid
       OR lower(btrim(a.email)) = v_email
       OR EXISTS (
          SELECT 1 FROM unnest(coalesce(a.emails_adicionales, ARRAY[]::text[])) x
          WHERE lower(btrim(x)) = v_email
       ))
   ORDER BY a.created_at
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'existing', 'alumno_id', v_existing);
  END IF;

  -- DNI, CUIL y teléfono detectan coincidencias; NO prueban titularidad.
  IF EXISTS (
    SELECT 1 FROM public.alumnos a
    WHERE a.fusionada_en IS NULL
      AND (
        (v_doc IS NOT NULL AND regexp_replace(coalesce(a.documento, ''), '[^0-9]', '', 'g') = v_doc)
        OR (length(v_phone_digits) = 10
          AND right(regexp_replace(coalesce(a.telefono, ''), '[^0-9]', '', 'g'), 10) = v_phone_digits)
      )
  ) THEN
    RETURN jsonb_build_object('status', 'possible_duplicate');
  END IF;

  INSERT INTO public.alumnos (
    id, user_id, nombre, apellido, email, telefono, documento,
    tipo_documento, estado, grupo
  )
  VALUES (
    gen_random_uuid(), v_uid, v_nombre, v_apellido, v_email,
    v_telefono, v_doc, v_tipo, 'inactivo', 'Sin grupo'
  ) RETURNING id INTO v_existing;

  RETURN jsonb_build_object('status', 'created', 'alumno_id', v_existing);
END;
$registration$;

REVOKE ALL ON FUNCTION public.register_verified_alumno(text, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_verified_alumno(text, text, text, text, text)
  TO authenticated, service_role;

-- El cliente público no debe poder eludir la verificación llamando INSERT
-- directamente a la API de datos. Administradores conservan su política propia.
DROP POLICY IF EXISTS "Anon can register alumnos" ON public.alumnos;
DROP POLICY IF EXISTS "Authenticated can register alumnos" ON public.alumnos;
