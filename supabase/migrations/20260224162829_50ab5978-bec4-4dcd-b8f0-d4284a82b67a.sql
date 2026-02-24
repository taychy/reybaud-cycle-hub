
-- Tabla de planes disponibles
CREATE TABLE public.planes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  descripcion text,
  precio numeric(10,2) NOT NULL,
  frecuencia text NOT NULL, -- 'mensual_libre', '2x_semana', '1x_semana'
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.planes ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede ver planes activos
CREATE POLICY "Anyone can view active planes"
  ON public.planes FOR SELECT
  USING (activo = true);

-- Admins pueden gestionar planes
CREATE POLICY "Admins can manage planes"
  ON public.planes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Tabla de suscripciones
CREATE TABLE public.suscripciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.planes(id),
  estado text NOT NULL DEFAULT 'pendiente', -- pendiente, activa, vencida, cancelada
  fecha_inicio date,
  fecha_fin date,
  mp_preference_id text,
  mp_payment_id text,
  mp_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;

-- Anon puede insertar suscripciones (al registrarse)
CREATE POLICY "Anyone can create suscripciones"
  ON public.suscripciones FOR INSERT
  WITH CHECK (true);

-- Anon puede ver sus propias suscripciones por alumno_id
CREATE POLICY "Anyone can view suscripciones"
  ON public.suscripciones FOR SELECT
  USING (true);

-- Admins pueden gestionar suscripciones
CREATE POLICY "Admins can manage suscripciones"
  ON public.suscripciones FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger updated_at
CREATE TRIGGER update_suscripciones_updated_at
  BEFORE UPDATE ON public.suscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insertar los 3 planes
INSERT INTO public.planes (nombre, descripcion, precio, frecuencia) VALUES
  ('Pase Libre Mensual', 'Acceso ilimitado a todos los entrenamientos del mes', 69834.00, 'mensual_libre'),
  ('Grupal 2x por semana', 'Entrenamientos grupales 2 veces por semana', 59777.00, '2x_semana'),
  ('Grupal 1x por semana', 'Entrenamientos grupales 1 vez por semana', 54008.35, '1x_semana');
