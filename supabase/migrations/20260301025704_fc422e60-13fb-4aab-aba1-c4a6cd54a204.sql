
-- Update existing participants to the new slug
UPDATE public.event_participants SET event_slug = 'record-de-la-hora' WHERE event_slug = 'record-del-ahora';

-- Update the default value for future inserts
ALTER TABLE public.event_participants ALTER COLUMN event_slug SET DEFAULT 'record-de-la-hora';
