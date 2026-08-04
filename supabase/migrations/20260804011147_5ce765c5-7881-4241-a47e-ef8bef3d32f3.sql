UPDATE public.vehiculo_cargas c
SET estado = 'cerrada', closed_at = coalesce(closed_at, now())
WHERE estado IN ('abierta','en_ruta')
  AND NOT EXISTS (SELECT 1 FROM public.vehiculo_carga_items i WHERE i.carga_id = c.id)
  AND EXISTS (
    SELECT 1 FROM public.vehiculo_cargas o
    JOIN public.vehiculo_carga_items i2 ON i2.carga_id = o.id
    WHERE o.sede_id = c.sede_id AND o.id <> c.id AND o.estado IN ('abierta','en_ruta')
  );

CREATE UNIQUE INDEX IF NOT EXISTS vehiculo_cargas_una_activa_por_sede
  ON public.vehiculo_cargas (sede_id)
  WHERE estado IN ('abierta','en_ruta');