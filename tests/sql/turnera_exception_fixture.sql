-- Esquema mínimo desechable. Nunca ejecutar contra Lovable Cloud.
CREATE TABLE public.coaches (id uuid PRIMARY KEY, nombre text);
CREATE TABLE public.sedes (id uuid PRIMARY KEY, nombre text);
CREATE TABLE public.servicios_turnera (
  id uuid PRIMARY KEY,
  precio numeric,
  moneda text,
  duracion_minutos integer,
  anticipacion_horas_minima integer,
  activo boolean
);
CREATE TABLE public.disponibilidad_coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  servicio_id uuid NOT NULL,
  dia_semana integer NOT NULL,
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  sede_id uuid,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.disponibilidad_ajustada (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid,
  fecha date NOT NULL,
  tipo text NOT NULL,
  hora_inicio time,
  hora_fin time
);
CREATE TABLE public.ausencias_coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  todo_el_dia boolean DEFAULT true,
  hora_inicio time,
  hora_fin time
);
CREATE TABLE public.reservas_turnera (
  id uuid PRIMARY KEY,
  servicio_id uuid,
  coach_id uuid,
  sede_id uuid,
  alumno_id uuid,
  fecha date,
  hora_inicio time,
  hora_fin time,
  nombre text,
  apellido text,
  email text,
  celular text,
  documento text,
  fecha_nacimiento date,
  nota text,
  acepto_politica boolean,
  precio_snapshot numeric,
  moneda_snapshot text,
  origen_link text,
  form_responses jsonb,
  estado_operativo text DEFAULT 'reservada'
);
CREATE TABLE public.grupal_conflicts (
  coach_id uuid,
  fecha date,
  hora_inicio time,
  hora_fin time,
  grupo text
);
CREATE FUNCTION public.agenda_grupal_conflicto(p_coach_id uuid, p_fecha date, p_hora_inicio time, p_hora_fin time)
RETURNS TABLE (grupo text, hora_inicio time, hora_fin time)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT g.grupo, g.hora_inicio, g.hora_fin
  FROM public.grupal_conflicts g
  WHERE g.coach_id = p_coach_id AND g.fecha = p_fecha
    AND p_hora_inicio < g.hora_fin AND p_hora_fin > g.hora_inicio
  ORDER BY g.hora_inicio LIMIT 1;
$$;

CREATE FUNCTION public.t_assert(p_condition boolean, p_name text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT COALESCE(p_condition, false) THEN RAISE EXCEPTION 'FAIL: %', p_name; END IF;
  RAISE NOTICE 'PASS: %', p_name;
END $$;

CREATE FUNCTION public.t_call(
  p_id uuid, p_servicio uuid, p_coach uuid, p_fecha date,
  p_inicio time, p_fin time, p_sede uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.create_turnera_reservation(
    p_id, p_servicio, p_coach, p_sede, p_fecha, p_inicio, p_fin,
    'Alumno', 'Prueba', 'prueba@example.com', '1100000000', '30111222',
    NULL, NULL, true, 'fixture', '{}'::jsonb, NULL
  );
END $$;

CREATE FUNCTION public.t_expect_error(
  p_expected text, p_name text,
  p_servicio uuid, p_coach uuid, p_fecha date,
  p_inicio time, p_fin time, p_sede uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.t_call(gen_random_uuid(), p_servicio, p_coach, p_fecha, p_inicio, p_fin, p_sede);
  RAISE EXCEPTION 'La prueba no produjo el rechazo esperado';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT ILIKE '%' || p_expected || '%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS: %', p_name;
END $$;

INSERT INTO public.servicios_turnera VALUES
  ('00000000-0000-0000-0000-000000000001', 1000, 'ARS', 60, 1, true),
  ('00000000-0000-0000-0000-000000000002', 1000, 'ARS', 60, 100000, true),
  ('00000000-0000-0000-0000-000000000003', 1000, 'ARS', 60, 100000, true);
INSERT INTO public.sedes VALUES
  ('00000000-0000-0000-0000-000000000101', 'Sede 1'),
  ('00000000-0000-0000-0000-000000000102', 'Sede 2');
INSERT INTO public.coaches
SELECT ('00000000-0000-0000-0000-00000000' || lpad(n::text, 4, '0'))::uuid, 'Coach ' || n
FROM generate_series(1, 20) n;
