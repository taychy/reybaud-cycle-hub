
-- Tabla de honorarios (valores por tipo de actividad)
CREATE TABLE public.honorarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_concepto text NOT NULL,
  categoria text NOT NULL DEFAULT 'clase',
  valor numeric NOT NULL DEFAULT 0,
  vigencia_desde date NOT NULL DEFAULT CURRENT_DATE,
  vigencia_hasta date,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.honorarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage honorarios" ON public.honorarios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can view honorarios" ON public.honorarios
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'coach'));

-- Tabla de reglas de liquidación
CREATE TABLE public.reglas_liquidacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_actividad text NOT NULL,
  estado_operativo text NOT NULL,
  liquida boolean NOT NULL DEFAULT false,
  porcentaje_pago integer NOT NULL DEFAULT 100,
  observacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tipo_actividad, estado_operativo)
);

ALTER TABLE public.reglas_liquidacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reglas_liquidacion" ON public.reglas_liquidacion
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can view reglas_liquidacion" ON public.reglas_liquidacion
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'coach'));

-- Liquidaciones mensuales por coach
CREATE TABLE public.liquidaciones_mensuales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  mes text NOT NULL,
  total_estimado numeric NOT NULL DEFAULT 0,
  total_confirmado numeric NOT NULL DEFAULT 0,
  total_pagado numeric NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'borrador',
  fecha_envio timestamptz,
  fecha_pago timestamptz,
  observaciones_admin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(coach_id, mes)
);

ALTER TABLE public.liquidaciones_mensuales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage liquidaciones_mensuales" ON public.liquidaciones_mensuales
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can view own liquidaciones" ON public.liquidaciones_mensuales
  FOR SELECT TO authenticated
  USING (coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid()));

-- Movimientos de liquidación
CREATE TABLE public.movimientos_liquidacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  tipo_actividad text NOT NULL,
  origen text NOT NULL DEFAULT 'agenda_admin',
  alumno_id uuid REFERENCES public.alumnos(id),
  nombre_externo text,
  grupo text,
  evento text,
  sede_id uuid REFERENCES public.sedes(id),
  duracion integer,
  valor_base numeric NOT NULL DEFAULT 0,
  viaticos numeric NOT NULL DEFAULT 0,
  entrada numeric NOT NULL DEFAULT 0,
  extras numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  estado_operativo text NOT NULL DEFAULT 'programada',
  estado_economico text NOT NULL DEFAULT 'pendiente_revision',
  observaciones text,
  entrenamiento_id uuid REFERENCES public.entrenamientos(id),
  reserva_turnera_id uuid,
  liquidacion_mensual_id uuid REFERENCES public.liquidaciones_mensuales(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.movimientos_liquidacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage movimientos_liquidacion" ON public.movimientos_liquidacion
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can view own movimientos" ON public.movimientos_liquidacion
  FOR SELECT TO authenticated
  USING (coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid()));

-- Servicios de turnera
CREATE TABLE public.servicios_turnera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nombre text NOT NULL,
  descripcion text,
  duracion_minutos integer NOT NULL DEFAULT 60,
  precio numeric,
  moneda text NOT NULL DEFAULT 'ARS',
  modalidad text DEFAULT 'presencial',
  politica_cancelacion text,
  activo boolean NOT NULL DEFAULT true,
  sede_id uuid REFERENCES public.sedes(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.servicios_turnera ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage servicios_turnera" ON public.servicios_turnera
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view active servicios" ON public.servicios_turnera
  FOR SELECT TO public
  USING (activo = true);

-- Disponibilidad de coaches por bloque horario
CREATE TABLE public.disponibilidad_coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES public.servicios_turnera(id) ON DELETE CASCADE,
  dia_semana integer NOT NULL,
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  sede_id uuid REFERENCES public.sedes(id),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.disponibilidad_coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage disponibilidad_coaches" ON public.disponibilidad_coaches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view active disponibilidad" ON public.disponibilidad_coaches
  FOR SELECT TO public
  USING (activo = true);

-- Reservas de turnera externa
CREATE TABLE public.reservas_turnera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios_turnera(id),
  coach_id uuid NOT NULL REFERENCES public.coaches(id),
  alumno_id uuid REFERENCES public.alumnos(id),
  fecha date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  sede_id uuid REFERENCES public.sedes(id),
  nombre text NOT NULL,
  apellido text NOT NULL,
  email text NOT NULL,
  celular text,
  documento text,
  fecha_nacimiento date,
  nota text,
  acepto_politica boolean NOT NULL DEFAULT false,
  estado_operativo text NOT NULL DEFAULT 'reservada',
  estado_economico text NOT NULL DEFAULT 'pendiente_revision',
  precio_snapshot numeric,
  moneda_snapshot text DEFAULT 'ARS',
  origen_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reservas_turnera ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reservas_turnera" ON public.reservas_turnera
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can view own reservas" ON public.reservas_turnera
  FOR SELECT TO authenticated
  USING (coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid()));

CREATE POLICY "Anyone can insert reservas" ON public.reservas_turnera
  FOR INSERT TO public
  WITH CHECK (true);

-- Add FK from movimientos to reservas_turnera
ALTER TABLE public.movimientos_liquidacion
  ADD CONSTRAINT movimientos_liquidacion_reserva_turnera_id_fkey
  FOREIGN KEY (reserva_turnera_id) REFERENCES public.reservas_turnera(id);

-- Enable realtime for movimientos
ALTER PUBLICATION supabase_realtime ADD TABLE public.movimientos_liquidacion;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservas_turnera;
