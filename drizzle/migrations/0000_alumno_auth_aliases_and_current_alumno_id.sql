-- 1) Tabla de aliases de identidad Auth por alumno canónico
CREATE TABLE IF NOT EXISTS public.alumno_auth_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  user_id uuid,
  email text,
  is_primary boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alumno_auth_aliases_identidad_chk CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS alumno_auth_aliases_user_id_uidx
  ON public.alumno_auth_aliases (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS alumno_auth_aliases_email_uidx
  ON public.alumno_auth_aliases (lower(btrim(email))) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS alumno_auth_aliases_alumno_idx
  ON public.alumno_auth_aliases (alumno_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alumno_auth_aliases TO authenticated;
GRANT ALL ON public.alumno_auth_aliases TO service_role;

ALTER TABLE public.alumno_auth_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage alumno_auth_aliases" ON public.alumno_auth_aliases;
CREATE POLICY "Admins manage alumno_auth_aliases"
  ON public.alumno_auth_aliases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

-- 2) Resolución canónica de la ficha del alumno para la sesión actual
CREATE OR REPLACE FUNCTION public.current_alumno_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(auth.email(), '')));
  v_id uuid;
  v_dest uuid;
BEGIN
  IF v_uid IS NULL AND v_email = '' THEN RETURN NULL; END IF;

  -- a) alumno activo (no fusionado) con user_id = auth.uid()
  IF v_uid IS NOT NULL THEN
    SELECT a.id INTO v_id FROM public.alumnos a
     WHERE a.user_id = v_uid AND a.fusionada_en IS NULL AND a.estado <> 'fusionada'
     LIMIT 1;
    -- b) alias activo por user_id
    IF v_id IS NULL THEN
      SELECT al.alumno_id INTO v_id FROM public.alumno_auth_aliases al
       WHERE al.active AND al.user_id = v_uid LIMIT 1;
    END IF;
  END IF;

  -- b) alias activo por email
  IF v_id IS NULL AND v_email <> '' THEN
    SELECT al.alumno_id INTO v_id FROM public.alumno_auth_aliases al
     WHERE al.active AND lower(btrim(al.email)) = v_email LIMIT 1;
  END IF;

  -- c) alumno no fusionado con email principal o adicional
  IF v_id IS NULL AND v_email <> '' THEN
    SELECT a.id INTO v_id FROM public.alumnos a
     WHERE a.fusionada_en IS NULL
       AND ( lower(btrim(a.email)) = v_email
             OR EXISTS (SELECT 1 FROM unnest(coalesce(a.emails_adicionales, ARRAY[]::text[])) e
                        WHERE lower(btrim(e)) = v_email) )
     ORDER BY CASE WHEN lower(btrim(a.email)) = v_email THEN 0 ELSE 1 END, a.created_at
     LIMIT 1;
  END IF;

  -- d) ficha fusionada cuyo email coincide
  IF v_id IS NULL AND v_email <> '' THEN
    SELECT a.id INTO v_id FROM public.alumnos a
     WHERE a.fusionada_en IS NOT NULL
       AND ( lower(btrim(a.email)) = v_email
             OR EXISTS (SELECT 1 FROM unnest(coalesce(a.emails_adicionales, ARRAY[]::text[])) e
                        WHERE lower(btrim(e)) = v_email) )
     LIMIT 1;
  END IF;

  -- seguir la cadena de fusiones hasta la ficha canónica
  FOR i IN 1..5 LOOP
    EXIT WHEN v_id IS NULL;
    SELECT a.fusionada_en INTO v_dest FROM public.alumnos a WHERE a.id = v_id;
    EXIT WHEN v_dest IS NULL;
    v_id := v_dest;
  END LOOP;

  RETURN v_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.current_alumno_id() TO authenticated, anon, service_role;

-- 3) Backfill de aliases desde datos existentes (sin inventar nada)
INSERT INTO public.alumno_auth_aliases (alumno_id, user_id, email, is_primary)
SELECT a.id, a.user_id, a.email, true
  FROM public.alumnos a
 WHERE a.fusionada_en IS NULL AND a.estado <> 'fusionada'
   AND a.user_id IS NOT NULL AND a.email IS NOT NULL AND btrim(a.email) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.alumno_auth_aliases (alumno_id, email, is_primary)
SELECT a.id, e, false
  FROM public.alumnos a,
       unnest(coalesce(a.emails_adicionales, ARRAY[]::text[])) e
 WHERE a.fusionada_en IS NULL AND a.estado <> 'fusionada'
   AND e IS NOT NULL AND btrim(e) <> '' AND e NOT ILIKE '%@reybaud.invalid'
ON CONFLICT DO NOTHING;

INSERT INTO public.alumno_auth_aliases (alumno_id, user_id, email, is_primary)
SELECT a.fusionada_en, a.user_id, a.email, false
  FROM public.alumnos a
 WHERE a.fusionada_en IS NOT NULL
   AND a.email IS NOT NULL AND btrim(a.email) <> '' AND a.email NOT ILIKE '%@reybaud.invalid'
ON CONFLICT DO NOTHING;

-- 4) RPC para que la app registre la identidad Auth actual como alias de su ficha canónica
CREATE OR REPLACE FUNCTION public.register_current_auth_alias()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_alumno uuid := public.current_alumno_id();
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(auth.email(), '')));
BEGIN
  IF v_alumno IS NULL OR v_uid IS NULL THEN RETURN v_alumno; END IF;

  INSERT INTO public.alumno_auth_aliases (alumno_id, user_id, email, is_primary)
  VALUES (v_alumno, v_uid, NULLIF(v_email, ''), false)
  ON CONFLICT DO NOTHING;

  -- si la ficha canónica no tiene identidad Auth, adoptarla
  UPDATE public.alumnos SET user_id = v_uid
   WHERE id = v_alumno AND user_id IS NULL;

  RETURN v_alumno;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.register_current_auth_alias() TO authenticated, service_role;

-- 5) Acceso del alumno a su propia ficha canónica (conserva políticas existentes)
DROP POLICY IF EXISTS "Alumno ve su ficha canonica" ON public.alumnos;
CREATE POLICY "Alumno ve su ficha canonica"
  ON public.alumnos FOR SELECT TO authenticated
  USING (id = public.current_alumno_id());

DROP POLICY IF EXISTS "Alumno edita su ficha canonica" ON public.alumnos;
CREATE POLICY "Alumno edita su ficha canonica"
  ON public.alumnos FOR UPDATE TO authenticated
  USING (id = public.current_alumno_id())
  WITH CHECK (id = public.current_alumno_id());

-- 6) Políticas de datos del alumno: resolver por ficha canónica en vez de user_id directo
DO $do$
DECLARE
  r record;
  v_pat text := '\( SELECT (alumnos|al|a)\.id[\s]+FROM alumnos( al| a)?[\s]+WHERE \((alumnos|al|a)\.user_id = auth\.uid\(\)\)\)';
  v_new text := '( SELECT public.current_alumno_id())';
  nq text; nc text; sql text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND ( coalesce(qual,'') ~ v_pat OR coalesce(with_check,'') ~ v_pat )
  LOOP
    nq := CASE WHEN r.qual IS NULL THEN NULL ELSE regexp_replace(r.qual, v_pat, v_new, 'g') END;
    nc := CASE WHEN r.with_check IS NULL THEN NULL ELSE regexp_replace(r.with_check, v_pat, v_new, 'g') END;
    sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF nq IS NOT NULL THEN sql := sql || format(' USING (%s)', nq); END IF;
    IF nc IS NOT NULL THEN sql := sql || format(' WITH CHECK (%s)', nc); END IF;
    EXECUTE sql;
  END LOOP;
END;
$do$;

-- 7) lookup_alumno_by_email: resolver también por aliases y siempre a la principal
CREATE OR REPLACE FUNCTION public.lookup_alumno_by_email(p_email text)
RETURNS TABLE(id uuid, nombre text, estado text, grupo text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
  v_dest uuid;
BEGIN
  IF v_email = '' THEN RETURN; END IF;

  SELECT a.id INTO v_id
    FROM public.alumnos a
   WHERE lower(btrim(a.email)) = v_email
      OR EXISTS (SELECT 1 FROM unnest(coalesce(a.emails_adicionales, ARRAY[]::text[])) e
                 WHERE lower(btrim(e)) = v_email)
   ORDER BY CASE WHEN lower(btrim(a.email)) = v_email THEN 0 ELSE 1 END,
            CASE WHEN a.fusionada_en IS NULL THEN 0 ELSE 1 END,
            a.created_at
   LIMIT 1;

  IF v_id IS NULL THEN
    SELECT al.alumno_id INTO v_id FROM public.alumno_auth_aliases al
     WHERE al.active AND lower(btrim(al.email)) = v_email LIMIT 1;
  END IF;

  FOR i IN 1..5 LOOP
    EXIT WHEN v_id IS NULL;
    SELECT a.fusionada_en INTO v_dest FROM public.alumnos a WHERE a.id = v_id;
    EXIT WHEN v_dest IS NULL;
    v_id := v_dest;
  END LOOP;

  RETURN QUERY
  SELECT a.id, a.nombre, a.estado, a.grupo::text
    FROM public.alumnos a WHERE a.id = v_id;
END;
$fn$;
