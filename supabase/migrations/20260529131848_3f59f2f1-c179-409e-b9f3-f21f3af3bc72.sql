-- Trigger to auto-fill customer snapshot on store_preorders insert,
-- using SECURITY DEFINER to bypass RLS on alumnos.

CREATE OR REPLACE FUNCTION public.fill_preorder_alumno_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre TEXT;
  v_apellido TEXT;
  v_email TEXT;
  v_telefono TEXT;
  v_documento TEXT;
BEGIN
  IF NEW.alumno_id IS NOT NULL THEN
    SELECT nombre, apellido, email, telefono, documento
      INTO v_nombre, v_apellido, v_email, v_telefono, v_documento
    FROM public.alumnos
    WHERE id = NEW.alumno_id;

    IF NEW.alumno_nombre IS NULL OR NEW.alumno_nombre = '' THEN
      NEW.alumno_nombre := NULLIF(TRIM(COALESCE(v_nombre,'') || ' ' || COALESCE(v_apellido,'')), '');
    END IF;
    IF NEW.alumno_email IS NULL THEN NEW.alumno_email := v_email; END IF;
    IF NEW.alumno_telefono IS NULL THEN NEW.alumno_telefono := v_telefono; END IF;
    IF NEW.alumno_dni IS NULL THEN NEW.alumno_dni := v_documento; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_preorder_alumno_snapshot ON public.store_preorders;
CREATE TRIGGER trg_fill_preorder_alumno_snapshot
BEFORE INSERT ON public.store_preorders
FOR EACH ROW
EXECUTE FUNCTION public.fill_preorder_alumno_snapshot();

-- Backfill recent NULL snapshots
UPDATE public.store_preorders p
SET
  alumno_nombre = COALESCE(p.alumno_nombre, NULLIF(TRIM(COALESCE(a.nombre,'') || ' ' || COALESCE(a.apellido,'')), '')),
  alumno_email = COALESCE(p.alumno_email, a.email),
  alumno_telefono = COALESCE(p.alumno_telefono, a.telefono),
  alumno_dni = COALESCE(p.alumno_dni, a.documento)
FROM public.alumnos a
WHERE p.alumno_id = a.id
  AND (p.alumno_nombre IS NULL OR p.alumno_email IS NULL OR p.alumno_telefono IS NULL OR p.alumno_dni IS NULL);