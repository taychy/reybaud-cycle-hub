ALTER TABLE public.gastos_recurrentes ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'fijo' CHECK (tipo IN ('fijo','variable'));
UPDATE public.gastos_recurrentes SET tipo = 'variable' WHERE frecuencia = 'variable';
CREATE INDEX IF NOT EXISTS idx_gastos_recurrentes_tipo ON public.gastos_recurrentes(tipo);