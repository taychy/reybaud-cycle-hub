ALTER TABLE public.entrenamientos
  ADD COLUMN resistencia smallint NOT NULL DEFAULT 0,
  ADD COLUMN tecnica smallint NOT NULL DEFAULT 0,
  ADD COLUMN intensidad smallint NOT NULL DEFAULT 0;