-- Test manual (ejecutar en transacción y hacer ROLLBACK):
-- valida que CUALQUIER UPDATE de alumnos.grupo reconcilia una única tarea whatsapp_grupo.
BEGIN;

-- Reemplazar por un alumno de prueba
\set alumno_id '00000000-0000-0000-0000-000000000000'

-- 1) G1 -> G2 crea UNA tarea con origen G1
UPDATE public.alumnos SET grupo = 'G1' WHERE id = :'alumno_id';
DELETE FROM public.tareas WHERE dedupe_key = 'wa_grupo_' || :'alumno_id';
UPDATE public.alumnos SET grupo = 'G2' WHERE id = :'alumno_id';
SELECT count(*) AS debe_ser_1, max(metadata->>'grupo_origen') AS debe_ser_G1
FROM public.tareas WHERE dedupe_key = 'wa_grupo_' || :'alumno_id' AND estado <> 'hecha';

-- 2) G2 -> G3 actualiza la MISMA tarea, conserva origen G1
UPDATE public.alumnos SET grupo = 'G3' WHERE id = :'alumno_id';
SELECT count(*) AS debe_ser_1, max(metadata->>'grupo_origen') AS debe_ser_G1,
       max(metadata->>'grupo_destino') AS debe_ser_G3
FROM public.tareas WHERE dedupe_key = 'wa_grupo_' || :'alumno_id' AND estado <> 'hecha';

-- 3) volver a G1 cancela la tarea
UPDATE public.alumnos SET grupo = 'G1' WHERE id = :'alumno_id';
SELECT count(*) AS debe_ser_0
FROM public.tareas WHERE dedupe_key = 'wa_grupo_' || :'alumno_id' AND estado <> 'hecha';

-- 4) sin cambio real no genera tarea
UPDATE public.alumnos SET grupo = 'G1' WHERE id = :'alumno_id';
SELECT count(*) AS debe_ser_0
FROM public.tareas WHERE dedupe_key = 'wa_grupo_' || :'alumno_id' AND estado <> 'hecha';

ROLLBACK;
