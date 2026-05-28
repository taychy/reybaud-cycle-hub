
-- 1) Add moneda column to facturas
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS moneda TEXT NOT NULL DEFAULT 'ARS';
CREATE INDEX IF NOT EXISTS idx_facturas_moneda ON public.facturas(moneda);

-- 2) Backfill moneda from suscripciones -> planes
UPDATE public.facturas f
SET moneda = COALESCE(p.moneda, 'ARS')
FROM public.suscripciones s
JOIN public.planes p ON p.id = s.plan_id
WHERE f.referencia_tipo = 'suscripcion'
  AND f.referencia_id = s.id
  AND f.moneda = 'ARS';

-- 3) Backfill moneda from event_reservations
UPDATE public.facturas f
SET moneda = COALESCE(r.currency_snapshot, r.moneda, 'ARS')
FROM public.event_reservations r
WHERE f.referencia_tipo IN ('evento','viaje')
  AND f.referencia_id = r.id
  AND f.moneda = 'ARS';

-- 4) Backfill moneda from store_preorders
UPDATE public.facturas f
SET moneda = COALESCE(pr.moneda, 'ARS')
FROM public.store_preorders pr
WHERE f.referencia_tipo = 'pedido'
  AND f.referencia_id = pr.id
  AND f.moneda = 'ARS';
