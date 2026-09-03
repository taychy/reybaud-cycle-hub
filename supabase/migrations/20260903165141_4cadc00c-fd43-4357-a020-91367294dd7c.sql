
UPDATE public.programa_clase_docentes d
   SET coach_id = c.id
  FROM public.coaches c
 WHERE d.coach_id IS NULL
   AND c.estado = 'activo'
   AND lower(split_part(c.nombre, ' ', 1)) = lower(d.nombre_planificado)
   AND (SELECT count(*) FROM public.coaches c2
         WHERE c2.estado = 'activo'
           AND lower(split_part(c2.nombre, ' ', 1)) = lower(d.nombre_planificado)) = 1;
