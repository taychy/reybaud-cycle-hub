DROP POLICY IF EXISTS "Alumnos crean sus store_order_items" ON public.store_order_items;
CREATE POLICY "Alumnos crean sus store_order_items"
  ON public.store_order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.store_orders o
      WHERE o.id = order_id
        AND (
          o.alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
          OR has_role(auth.uid(), 'admin'::app_role)
          OR is_super_admin(auth.uid())
        )
    )
  );