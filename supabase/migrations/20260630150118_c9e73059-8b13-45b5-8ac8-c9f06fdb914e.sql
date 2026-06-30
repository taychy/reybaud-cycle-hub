GRANT SELECT ON public.event_addons TO anon, authenticated;
GRANT ALL ON public.event_addons TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_addons TO authenticated;
GRANT ALL ON public.reservation_addons TO service_role;

DROP POLICY IF EXISTS "reservation_addons owner or admin select" ON public.reservation_addons;
CREATE POLICY "reservation_addons owner or admin select"
ON public.reservation_addons
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.event_reservations er
    JOIN public.alumnos a ON a.id = er.alumno_id
    WHERE er.id = reservation_addons.reservation_id
      AND (a.user_id = auth.uid() OR a.email = auth.email())
  )
);

DROP POLICY IF EXISTS "reservation_addons students insert own" ON public.reservation_addons;
CREATE POLICY "reservation_addons students insert own"
ON public.reservation_addons
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.event_reservations er
    JOIN public.alumnos a ON a.id = er.alumno_id
    JOIN public.event_addons ea ON ea.id = reservation_addons.addon_id
    WHERE er.id = reservation_addons.reservation_id
      AND ea.event_id = er.event_id
      AND ea.activo = true
      AND (a.user_id = auth.uid() OR a.email = auth.email())
  )
);

DROP POLICY IF EXISTS "reservation_addons students update own" ON public.reservation_addons;
CREATE POLICY "reservation_addons students update own"
ON public.reservation_addons
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.event_reservations er
    JOIN public.alumnos a ON a.id = er.alumno_id
    WHERE er.id = reservation_addons.reservation_id
      AND (a.user_id = auth.uid() OR a.email = auth.email())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.event_reservations er
    JOIN public.alumnos a ON a.id = er.alumno_id
    JOIN public.event_addons ea ON ea.id = reservation_addons.addon_id
    WHERE er.id = reservation_addons.reservation_id
      AND ea.event_id = er.event_id
      AND ea.activo = true
      AND (a.user_id = auth.uid() OR a.email = auth.email())
  )
);

DROP POLICY IF EXISTS "reservation_addons students delete own" ON public.reservation_addons;
CREATE POLICY "reservation_addons students delete own"
ON public.reservation_addons
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.event_reservations er
    JOIN public.alumnos a ON a.id = er.alumno_id
    WHERE er.id = reservation_addons.reservation_id
      AND (a.user_id = auth.uid() OR a.email = auth.email())
  )
);