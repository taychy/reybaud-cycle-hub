SET LOCAL ROLE service_role;
UPDATE public.suscripciones
SET precio_base = 0, precio_final = 0
WHERE id = '248c2962-17b0-4bfa-9018-18ae3d205837'
  AND alumno_id = '58099e88-0082-4b0f-8b59-2a80659a0a9b';
RESET ROLE;