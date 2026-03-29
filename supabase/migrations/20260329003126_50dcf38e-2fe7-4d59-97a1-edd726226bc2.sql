
CREATE TABLE public.mejoras_sugeridas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_email text NOT NULL,
  autor_nombre text NOT NULL,
  mensaje text NOT NULL,
  leido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mejoras_sugeridas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage mejoras"
ON public.mejoras_sugeridas
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE admin_profiles.user_id = auth.uid()
    AND admin_profiles.role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE admin_profiles.user_id = auth.uid()
    AND admin_profiles.role = 'super_admin'
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.mejoras_sugeridas;
