
ALTER TABLE public.store_preorders
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT,
  ADD COLUMN IF NOT EXISTS sena_pagada_at TIMESTAMPTZ;

-- Allow anonymous read of a single preorder product via public link
DROP POLICY IF EXISTS "Public can view active preorder products" ON public.store_products;
CREATE POLICY "Public can view active preorder products"
ON public.store_products
FOR SELECT
TO anon
USING (
  is_preorder = true
  AND status = 'active'
  AND COALESCE(preorder_status, 'abierta') = 'abierta'
);

GRANT SELECT ON public.store_products TO anon;
