
-- Create coaches table
CREATE TABLE public.coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nombre text NOT NULL,
  email text NOT NULL,
  grupos public.grupo_ciclismo[] NOT NULL DEFAULT '{}',
  estado text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coaches"
  ON public.coaches FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coach can view own profile"
  ON public.coaches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can register as coach"
  ON public.coaches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Coach can update own profile"
  ON public.coaches FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_coaches_updated_at
  BEFORE UPDATE ON public.coaches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Coaches can manage entrenamientos for their groups
CREATE POLICY "Coaches can manage entrenamientos for their groups"
  ON public.entrenamientos FOR ALL
  USING (
    public.has_role(auth.uid(), 'coach') AND
    grupo IN (
      SELECT unnest(grupos) FROM public.coaches WHERE user_id = auth.uid()
    )
  );

-- Coaches can view alumnos in their groups
CREATE POLICY "Coaches can view alumnos in their groups"
  ON public.alumnos FOR SELECT
  USING (
    public.has_role(auth.uid(), 'coach') AND
    grupo IN (
      SELECT unnest(grupos) FROM public.coaches WHERE user_id = auth.uid()
    )
  );
