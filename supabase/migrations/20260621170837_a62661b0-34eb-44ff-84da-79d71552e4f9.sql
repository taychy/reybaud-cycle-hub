ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS precio_aviso_texto text,
  ADD COLUMN IF NOT EXISTS precio_aviso_tipo text NOT NULL DEFAULT 'info'
    CHECK (precio_aviso_tipo IN ('info','warning','promo')),
  ADD COLUMN IF NOT EXISTS precio_aviso_hasta timestamptz,
  ADD COLUMN IF NOT EXISTS precio_aviso_activo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.precio_aviso_texto IS 'Texto libre del banner comercial mostrado en EventDetail (ej: "Últimos 5 cupos", "Precio sube el 30/06").';
COMMENT ON COLUMN public.events.precio_aviso_tipo IS 'Estilo visual del banner: info | warning | promo.';
COMMENT ON COLUMN public.events.precio_aviso_hasta IS 'Si está seteado y now() lo supera, el banner se oculta automáticamente.';
COMMENT ON COLUMN public.events.precio_aviso_activo IS 'Switch manual para mostrar/ocultar el banner sin borrar el texto.';