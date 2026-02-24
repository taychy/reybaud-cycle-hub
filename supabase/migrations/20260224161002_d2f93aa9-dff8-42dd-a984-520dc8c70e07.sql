
-- Create enum for groups
CREATE TYPE public.grupo_ciclismo AS ENUM ('G1', 'G2', 'G3', 'G4', 'Sin grupo');

-- Create enum for training type
CREATE TYPE public.tipo_entrenamiento AS ENUM ('ruta', 'rodillo', 'gimnasio', 'tecnica');

-- Create enum for plan status
CREATE TYPE public.estado_plan AS ENUM ('borrador', 'publicado');

-- Create enum for app roles
CREATE TYPE public.app_role AS ENUM ('admin', 'alumno');

-- Create alumnos table (students - no auth needed, admin imports them)
CREATE TABLE public.alumnos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telefono TEXT,
  notas TEXT,
  grupo grupo_ciclismo NOT NULL DEFAULT 'Sin grupo',
  estado TEXT NOT NULL DEFAULT 'inactivo' CHECK (estado IN ('activo', 'inactivo')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table for admin access
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Create importaciones_usuarios table
CREATE TABLE public.importaciones_usuarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  archivo_original_url TEXT,
  fecha_carga TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  cargado_por UUID REFERENCES auth.users(id),
  cantidad_ok INTEGER NOT NULL DEFAULT 0,
  cantidad_error INTEGER NOT NULL DEFAULT 0,
  log_errores TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create plan_mensual table
CREATE TABLE public.plan_mensual (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mes TEXT NOT NULL, -- YYYY-MM format
  archivo_original_url TEXT,
  estado estado_plan NOT NULL DEFAULT 'borrador',
  fecha_carga TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  cargado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create entrenamientos table
CREATE TABLE public.entrenamientos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL,
  grupo grupo_ciclismo NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  tipo tipo_entrenamiento,
  link_archivo TEXT,
  origen_importacion_id UUID REFERENCES public.plan_mensual(id) ON DELETE SET NULL,
  visible BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.alumnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importaciones_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_mensual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrenamientos ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS for user_roles: only admins can view
CREATE POLICY "Admins can view roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS for alumnos: admins can do everything, anon can read for login check
CREATE POLICY "Admins can manage alumnos" ON public.alumnos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anon can lookup by email" ON public.alumnos
  FOR SELECT TO anon
  USING (true);

-- RLS for entrenamientos: admins manage, anyone can read visible ones
CREATE POLICY "Admins can manage entrenamientos" ON public.entrenamientos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view visible entrenamientos" ON public.entrenamientos
  FOR SELECT TO anon
  USING (visible = true);

-- RLS for plan_mensual: admins only
CREATE POLICY "Admins can manage planes" ON public.plan_mensual
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view planes" ON public.plan_mensual
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS for importaciones: admins only
CREATE POLICY "Admins can manage importaciones" ON public.importaciones_usuarios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_alumnos_updated_at
  BEFORE UPDATE ON public.alumnos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_entrenamientos_updated_at
  BEFORE UPDATE ON public.entrenamientos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast training lookups
CREATE INDEX idx_entrenamientos_fecha_grupo ON public.entrenamientos(fecha, grupo);
CREATE INDEX idx_alumnos_email ON public.alumnos(email);
