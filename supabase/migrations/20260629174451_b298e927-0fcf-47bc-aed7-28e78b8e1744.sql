DO $$
BEGIN
  ALTER TABLE public.suscripciones DISABLE TRIGGER USER;
  UPDATE public.suscripciones s
  SET precio_base = p.precio,
      precio_final = p.precio,
      updated_at = now()
  FROM public.planes p
  WHERE s.plan_id = p.id
    AND s.estado IN ('activa','pendiente','cancelada')
    AND s.fecha_fin >= CURRENT_DATE
    AND s.precio_base IS NOT NULL
    AND s.precio_base <> p.precio
    AND s.descuento_id IS NULL;
  ALTER TABLE public.suscripciones ENABLE TRIGGER USER;
END $$;