ALTER TABLE public.objetivos_alumno 
  RENAME COLUMN fecha_objetivo TO fecha_fin;

ALTER TABLE public.objetivos_alumno 
  ADD COLUMN fecha_inicio date;