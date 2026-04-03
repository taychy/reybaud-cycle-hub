-- Add default emisor flag
ALTER TABLE public.emisores_fiscales ADD COLUMN es_predeterminado boolean NOT NULL DEFAULT false;

-- Add facturacion_automatica flag
ALTER TABLE public.emisores_fiscales ADD COLUMN facturacion_automatica boolean NOT NULL DEFAULT false;

-- Function to ensure only one emisor is default at a time
CREATE OR REPLACE FUNCTION public.ensure_single_default_emisor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.es_predeterminado = true THEN
    UPDATE emisores_fiscales SET es_predeterminado = false WHERE id <> NEW.id AND es_predeterminado = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ensure_single_default_emisor
BEFORE INSERT OR UPDATE OF es_predeterminado ON public.emisores_fiscales
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_default_emisor();