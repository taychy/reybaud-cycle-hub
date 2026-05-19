ALTER TABLE public.emisores_fiscales
ADD COLUMN IF NOT EXISTS auto_facturar_origenes text[]
NOT NULL DEFAULT ARRAY['app_online','manual_admin','efectivo','transferencia']::text[];