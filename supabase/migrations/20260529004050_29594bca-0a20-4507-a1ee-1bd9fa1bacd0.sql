
ALTER TABLE public.store_preorders
  ADD COLUMN IF NOT EXISTS alumno_nombre text,
  ADD COLUMN IF NOT EXISTS alumno_email text,
  ADD COLUMN IF NOT EXISTS alumno_telefono text,
  ADD COLUMN IF NOT EXISTS alumno_dni text;

UPDATE public.store_preorders p
SET alumno_nombre = NULLIF(TRIM(COALESCE(a.nombre,'') || ' ' || COALESCE(a.apellido,'')), ''),
    alumno_email = a.email,
    alumno_telefono = a.telefono,
    alumno_dni = a.documento
FROM public.alumnos a
WHERE a.id = p.alumno_id
  AND (p.alumno_nombre IS NULL OR p.alumno_nombre = '');
