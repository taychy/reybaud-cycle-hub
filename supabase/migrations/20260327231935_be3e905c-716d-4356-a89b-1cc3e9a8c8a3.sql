
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS same_day boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'borrador',
  ADD COLUMN IF NOT EXISTS show_public boolean NOT NULL DEFAULT false;

-- Migrate existing data: is_active=true + visible_to_students=true → publicado
UPDATE public.events SET status = 'publicado' WHERE is_active = true AND visible_to_students = true;
UPDATE public.events SET status = 'borrador' WHERE is_active = false OR visible_to_students = false;
UPDATE public.events SET show_public = visible_to_students;
