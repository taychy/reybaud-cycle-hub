-- Phase 2: Real auto-charge via MP Preapproval

-- Add auto-charge fields to suscripciones
ALTER TABLE public.suscripciones
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_preapproval_status TEXT,
  ADD COLUMN IF NOT EXISTS auto_cobro_activo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ultimo_intento_cobro_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS intentos_cobro_fallidos INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_suscripciones_mp_preapproval_id
  ON public.suscripciones(mp_preapproval_id)
  WHERE mp_preapproval_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suscripciones_auto_cobro_activo
  ON public.suscripciones(auto_cobro_activo)
  WHERE auto_cobro_activo = true;

-- Add per-plan toggle (default true for monthly only)
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS permite_auto_cobro BOOLEAN NOT NULL DEFAULT false;

-- Backfill: enable auto-charge on monthly plans by default
UPDATE public.planes
SET permite_auto_cobro = true
WHERE frecuencia = 'mensual' AND permite_auto_cobro = false;