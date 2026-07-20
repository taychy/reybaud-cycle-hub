
UPDATE public.descuentos_alumno
SET activo = false,
    fecha_fin = CURRENT_DATE
WHERE descuento_id = '261be851-4d04-49fd-93ab-b15415d26c5b'
  AND activo = true;
