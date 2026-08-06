-- 1) Normalización de nombre: evita "Maja Steovic" + apellido "Steovic"
CREATE OR REPLACE FUNCTION public.normalize_alumno_nombre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n text;
  a text;
BEGIN
  n := regexp_replace(coalesce(NEW.nombre, ''), '\s+', ' ', 'g');
  n := btrim(n);
  a := btrim(regexp_replace(coalesce(NEW.apellido, ''), '\s+', ' ', 'g'));

  IF a <> '' AND lower(n) LIKE '% ' || lower(a) THEN
    n := btrim(left(n, length(n) - length(a) - 1));
  END IF;

  IF n <> '' THEN
    NEW.nombre := n;
  END IF;
  IF a <> '' THEN
    NEW.apellido := a;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_alumno_nombre ON public.alumnos;
CREATE TRIGGER trg_normalize_alumno_nombre
BEFORE INSERT OR UPDATE OF nombre, apellido ON public.alumnos
FOR EACH ROW EXECUTE FUNCTION public.normalize_alumno_nombre();

-- 2) Backfill de nombres con apellido repetido
UPDATE public.alumnos
SET nombre = btrim(left(btrim(nombre), length(btrim(nombre)) - length(btrim(apellido)) - 1))
WHERE apellido IS NOT NULL
  AND btrim(apellido) <> ''
  AND lower(btrim(nombre)) LIKE '% ' || lower(btrim(apellido));

-- 3) Lookup anti-duplicado para el registro público (datos enmascarados)
CREATE OR REPLACE FUNCTION public.lookup_alumno_duplicate(
  p_email text DEFAULT NULL,
  p_telefono text DEFAULT NULL,
  p_documento text DEFAULT NULL
)
RETURNS TABLE (
  motivo text,
  nombre_parcial text,
  email_enmascarado text,
  estado text
)
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
      WHEN n.doc <> '' AND regexp_replace(coalesce(a.documento, ''), '\D', '', 'g') = n.doc THEN 'documento'
      ELSE 'telefono'
    END AS motivo,
    btrim(split_part(a.nombre, ' ', 1)) || ' ' || left(coalesce(a.apellido, ''), 1) || '.' AS nombre_parcial,
    left(split_part(a.email, '@', 1), 2) || '***@' || split_part(a.email, '@', 2) AS email_enmascarado,
    a.estado::text
  FROM public.alumnos a, norm n
  WHERE
    (n.em <> '' AND lower(btrim(a.email)) = n.em)
    OR (length(n.tel) = 10 AND right(regexp_replace(coalesce(a.telefono, ''), '\D', '', 'g'), 10) = n.tel)
    OR (length(n.doc) >= 7 AND regexp_replace(coalesce(a.documento, ''), '\D', '', 'g') = n.doc)
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_alumno_duplicate(text, text, text) TO anon, authenticated;