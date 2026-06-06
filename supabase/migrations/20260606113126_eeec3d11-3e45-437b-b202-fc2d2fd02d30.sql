
-- Allow alumno to update own pending order within 12h (only to cancel or change total when adding items)
DROP POLICY IF EXISTS "Alumnos editan sus store_orders 12h" ON public.store_orders;
CREATE POLICY "Alumnos editan sus store_orders 12h"
ON public.store_orders
FOR UPDATE
TO authenticated
USING (
  alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
  AND status IN ('pendiente', 'pendiente_pago')
  AND created_at > now() - interval '12 hours'
)
WITH CHECK (
  alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
  AND status IN ('pendiente', 'pendiente_pago', 'cancelado')
  AND created_at > now() - interval '12 hours'
);

-- Allow alumno to add items into own pending order within 12h
DROP POLICY IF EXISTS "Alumnos crean sus store_order_items" ON public.store_order_items;
CREATE POLICY "Alumnos crean sus store_order_items"
ON public.store_order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.store_orders o
    WHERE o.id = store_order_items.order_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR is_super_admin(auth.uid())
        OR (
          o.alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
          AND o.status IN ('pendiente', 'pendiente_pago')
          AND o.created_at > now() - interval '12 hours'
        )
      )
  )
);
