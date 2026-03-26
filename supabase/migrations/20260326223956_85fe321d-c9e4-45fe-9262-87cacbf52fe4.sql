
-- 1. Tabla registro_sesiones: tracking de sesiones planificadas (realizada / no_realizada)
CREATE TABLE public.registro_sesiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  entrenamiento_id uuid NOT NULL REFERENCES public.entrenamientos(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('realizada', 'no_realizada')),
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (alumno_id, entrenamiento_id)
);

ALTER TABLE public.registro_sesiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage registro_sesiones" ON public.registro_sesiones
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can view own registro_sesiones" ON public.registro_sesiones
  FOR SELECT TO authenticated
  USING (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));

CREATE POLICY "Students can insert own registro_sesiones" ON public.registro_sesiones
  FOR INSERT TO authenticated
  WITH CHECK (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));

CREATE POLICY "Students can update own registro_sesiones" ON public.registro_sesiones
  FOR UPDATE TO authenticated
  USING (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()))
  WITH CHECK (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));

CREATE POLICY "Coaches can manage registro_sesiones" ON public.registro_sesiones
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'coach'))
  WITH CHECK (public.has_role(auth.uid(), 'coach'));

-- 2. Tabla sesiones_extra: sesiones adicionales cargadas por el alumno
CREATE TABLE public.sesiones_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'libre',
  fecha date NOT NULL,
  duracion_minutos integer,
  comentario text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sesiones_extra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sesiones_extra" ON public.sesiones_extra
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can view own sesiones_extra" ON public.sesiones_extra
  FOR SELECT TO authenticated
  USING (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));

CREATE POLICY "Students can insert own sesiones_extra" ON public.sesiones_extra
  FOR INSERT TO authenticated
  WITH CHECK (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));

CREATE POLICY "Students can delete own sesiones_extra" ON public.sesiones_extra
  FOR DELETE TO authenticated
  USING (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));

CREATE POLICY "Coaches can view sesiones_extra" ON public.sesiones_extra
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'coach'));

-- 3. Tabla objetivos_alumno: objetivo principal del alumno
CREATE TABLE public.objetivos_alumno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  fecha_objetivo date,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.objetivos_alumno ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage objetivos_alumno" ON public.objetivos_alumno
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can view own objetivos" ON public.objetivos_alumno
  FOR SELECT TO authenticated
  USING (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));

CREATE POLICY "Students can insert own objetivos" ON public.objetivos_alumno
  FOR INSERT TO authenticated
  WITH CHECK (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));

CREATE POLICY "Students can update own objetivos" ON public.objetivos_alumno
  FOR UPDATE TO authenticated
  USING (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()))
  WITH CHECK (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));

CREATE POLICY "Coaches can view objetivos" ON public.objetivos_alumno
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'coach'));
