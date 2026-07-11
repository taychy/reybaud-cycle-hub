ALTER TABLE public.event_surveys
  ADD COLUMN IF NOT EXISTS mostrar_album boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS album_titulo text,
  ADD COLUMN IF NOT EXISTS album_url text,
  ADD COLUMN IF NOT EXISTS album_cover_image_url text,
  ADD COLUMN IF NOT EXISTS album_mensaje text,
  ADD COLUMN IF NOT EXISTS album_cta_label text DEFAULT 'Ver el álbum completo';