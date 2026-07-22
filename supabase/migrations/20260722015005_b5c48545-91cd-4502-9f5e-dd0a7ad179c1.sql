GRANT SELECT ON public.ausencias_coaches TO anon;

DROP POLICY IF EXISTS "Public can view future ausencias" ON public.ausencias_coaches;
CREATE POLICY "Public can view future ausencias"
  ON public.ausencias_coaches
  FOR SELECT
  TO anon, authenticated
  USING (fecha_fin >= CURRENT_DATE);