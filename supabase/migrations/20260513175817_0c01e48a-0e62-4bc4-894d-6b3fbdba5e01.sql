-- Enums
CREATE TYPE public.tarea_tipo AS ENUM ('automatica', 'manual', 'recurrente');
CREATE TYPE public.tarea_estado AS ENUM ('pendiente', 'en_curso', 'hecha', 'pospuesta');
CREATE TYPE public.tarea_prioridad AS ENUM ('baja', 'media', 'alta', 'critica');
CREATE TYPE public.tarea_rol AS ENUM ('super_admin', 'admin', 'coach', 'deposito');

-- Tabla principal
CREATE TABLE public.tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.tarea_tipo NOT NULL DEFAULT 'manual',
  origen text NOT NULL DEFAULT 'manual',
  titulo text NOT NULL,
  descripcion text,
  rol_destino public.tarea_rol NOT NULL,
  asignado_user_id uuid,
  entidad_tipo text,
  entidad_id text,
  prioridad public.tarea_prioridad NOT NULL DEFAULT 'media',
  fecha_vencimiento date,
  estado public.tarea_estado NOT NULL DEFAULT 'pendiente',
  pospuesta_hasta date,
  nota_cierre text,
  cerrada_por uuid,
  cerrada_at timestamptz,
  dedupe_key text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tareas_rol_estado ON public.tareas(rol_destino, estado);
CREATE INDEX idx_tareas_asignado ON public.tareas(asignado_user_id) WHERE asignado_user_id IS NOT NULL;
CREATE INDEX idx_tareas_vencimiento ON public.tareas(fecha_vencimiento) WHERE estado IN ('pendiente','en_curso','pospuesta');
CREATE INDEX idx_tareas_origen ON public.tareas(origen);

-- Trigger updated_at
CREATE TRIGGER trg_tareas_updated_at
BEFORE UPDATE ON public.tareas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Historial
CREATE TABLE public.tareas_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES public.tareas(id) ON DELETE CASCADE,
  accion text NOT NULL,
  estado_anterior public.tarea_estado,
  estado_nuevo public.tarea_estado,
  nota text,
  cambio jsonb,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tareas_historial_tarea ON public.tareas_historial(tarea_id, created_at DESC);

-- RLS
ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tareas_historial ENABLE ROW LEVEL SECURITY;

-- Super admin (admin role engloba super_admin? No: super_admin vive en admin_profiles.role)
-- Helper: is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE user_id = _user_id AND role = 'super_admin'::admin_role AND status = 'active'
  )
$$;

-- Helper: get coach user role match
CREATE OR REPLACE FUNCTION public.user_matches_tarea_rol(_user_id uuid, _rol public.tarea_rol)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _rol
    WHEN 'super_admin' THEN public.is_super_admin(_user_id)
    WHEN 'admin' THEN public.has_role(_user_id, 'admin'::app_role)
    WHEN 'coach' THEN public.has_role(_user_id, 'coach'::app_role)
    WHEN 'deposito' THEN EXISTS (SELECT 1 FROM public.deposito_profiles WHERE user_id = _user_id AND estado = 'activo')
  END
$$;

-- Policies tareas
CREATE POLICY "Super admin manage tareas" ON public.tareas
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Users view tareas of their role or assigned" ON public.tareas
FOR SELECT TO authenticated
USING (
  asignado_user_id = auth.uid()
  OR public.user_matches_tarea_rol(auth.uid(), rol_destino)
);

CREATE POLICY "Users update tareas of their role or assigned" ON public.tareas
FOR UPDATE TO authenticated
USING (
  asignado_user_id = auth.uid()
  OR public.user_matches_tarea_rol(auth.uid(), rol_destino)
)
WITH CHECK (
  asignado_user_id = auth.uid()
  OR public.user_matches_tarea_rol(auth.uid(), rol_destino)
);

CREATE POLICY "Admins create manual tareas" ON public.tareas
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
);

-- Policies historial
CREATE POLICY "View historial of accessible tareas" ON public.tareas_historial
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tareas t
    WHERE t.id = tarea_id
      AND (
        t.asignado_user_id = auth.uid()
        OR public.user_matches_tarea_rol(auth.uid(), t.rol_destino)
        OR public.is_super_admin(auth.uid())
      )
  )
);

CREATE POLICY "Insert historial for accessible tareas" ON public.tareas_historial
FOR INSERT TO authenticated
WITH CHECK (
  changed_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tareas t
    WHERE t.id = tarea_id
      AND (
        t.asignado_user_id = auth.uid()
        OR public.user_matches_tarea_rol(auth.uid(), t.rol_destino)
        OR public.is_super_admin(auth.uid())
      )
  )
);

-- Función generadora de tareas automáticas
CREATE OR REPLACE FUNCTION public.generate_tareas_automaticas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_today date := CURRENT_DATE;
  v_day integer := EXTRACT(DAY FROM CURRENT_DATE)::integer;
  v_month text := to_char(CURRENT_DATE, 'YYYY-MM');
  v_grupo text;
  r record;
BEGIN
  -- 1. WhatsApp check (días 5-7 y 15-17)
  IF v_day BETWEEN 5 AND 7 OR v_day BETWEEN 15 AND 17 THEN
    FOR v_grupo IN
      SELECT DISTINCT grupo::text FROM public.alumnos WHERE estado = 'activo'
    LOOP
      INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, fecha_vencimiento, dedupe_key, metadata)
      VALUES (
        'automatica', 'whatsapp_check',
        'Chequear WhatsApp del grupo ' || v_grupo,
        'Validar que todos los alumnos activos del grupo ' || v_grupo || ' estén en el grupo de WhatsApp correspondiente.',
        'admin', 'alta',
        CASE WHEN v_day <= 7 THEN make_date(EXTRACT(YEAR FROM v_today)::int, EXTRACT(MONTH FROM v_today)::int, 7)
             ELSE make_date(EXTRACT(YEAR FROM v_today)::int, EXTRACT(MONTH FROM v_today)::int, 17) END,
        'whatsapp_check:' || v_grupo || ':' || v_month || ':' || (CASE WHEN v_day <= 7 THEN 'q1' ELSE 'q2' END),
        jsonb_build_object('grupo', v_grupo, 'mes', v_month)
      )
      ON CONFLICT (dedupe_key) DO NOTHING;
      IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;
  END IF;

  -- 2. Alumnos activos +30d sin actualización
  FOR r IN
    SELECT a.id, a.nombre, a.apellido FROM public.alumnos a
    WHERE a.estado = 'activo'
      AND a.updated_at < (now() - interval '30 days')
  LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES (
      'automatica', 'alumno_inactivo_30d',
      'Contactar a ' || r.nombre || ' ' || COALESCE(r.apellido, ''),
      'Alumno activo sin actividad ni actualizaciones hace más de 30 días. Riesgo de abandono.',
      'admin', 'alta', 'alumno', r.id::text,
      'alumno_inactivo_30d:' || r.id::text || ':' || v_month,
      jsonb_build_object('alumno_id', r.id)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 3. Coaches sin feedback +14d
  FOR r IN
    SELECT c.id, c.user_id, c.nombre,
      (SELECT MAX(fecha) FROM public.feedback_coach WHERE coach_id = c.id) AS last_fb
    FROM public.coaches c
    WHERE c.estado = 'activo'
  LOOP
    IF r.last_fb IS NULL OR r.last_fb < (v_today - interval '14 days') THEN
      INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, asignado_user_id, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
      VALUES (
        'automatica', 'coach_sin_feedback_14d',
        'Cargar feedback de alumnos',
        'Hace más de 14 días que no registrás feedback de tus alumnos. Cargá observaciones para mantener el seguimiento.',
        'coach', r.user_id, 'media', 'coach', r.id::text,
        'coach_sin_feedback_14d:' || r.id::text || ':' || to_char(v_today, 'IYYY-IW'),
        jsonb_build_object('coach_id', r.id, 'last_feedback', r.last_fb)
      )
      ON CONFLICT (dedupe_key) DO NOTHING;
      IF FOUND THEN v_count := v_count + 1; END IF;
    END IF;
  END LOOP;

  -- 4. Certificados médicos por vencer (próximos 30 días) o vencidos
  FOR r IN
    SELECT id, nombre, apellido, medical_certificate_expiration_date
    FROM public.alumnos
    WHERE estado = 'activo'
      AND medical_certificate_expiration_date IS NOT NULL
      AND medical_certificate_expiration_date <= (v_today + interval '30 days')
  LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, fecha_vencimiento, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES (
      'automatica', 'certificado_por_vencer',
      'Certificado médico de ' || r.nombre || ' ' || COALESCE(r.apellido, ''),
      CASE WHEN r.medical_certificate_expiration_date < v_today
           THEN 'Certificado VENCIDO el ' || r.medical_certificate_expiration_date || '. Solicitar renovación urgente.'
           ELSE 'Certificado vence el ' || r.medical_certificate_expiration_date || '. Recordar al alumno renovarlo.' END,
      'admin',
      CASE WHEN r.medical_certificate_expiration_date < v_today THEN 'critica'::tarea_prioridad ELSE 'media'::tarea_prioridad END,
      r.medical_certificate_expiration_date, 'alumno', r.id::text,
      'certificado_por_vencer:' || r.id::text || ':' || r.medical_certificate_expiration_date,
      jsonb_build_object('alumno_id', r.id, 'vence', r.medical_certificate_expiration_date)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 5. Pagos pendientes de verificación +48h
  FOR r IN
    SELECT s.id, s.alumno_id, a.nombre, a.apellido, s.updated_at
    FROM public.suscripciones s
    JOIN public.alumnos a ON a.id = s.alumno_id
    WHERE s.estado = 'pendiente_verificacion'
      AND s.updated_at < (now() - interval '48 hours')
  LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES (
      'automatica', 'pago_pendiente_validar',
      'Validar pago de ' || r.nombre || ' ' || COALESCE(r.apellido, ''),
      'Hay un pago informado hace más de 48 horas que sigue pendiente de verificación.',
      'admin', 'alta', 'suscripcion', r.id::text,
      'pago_pendiente_validar:' || r.id::text,
      jsonb_build_object('suscripcion_id', r.id, 'alumno_id', r.alumno_id)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 6. Reactivar tareas pospuestas que ya cumplieron su fecha
  UPDATE public.tareas
  SET estado = 'pendiente', pospuesta_hasta = NULL, updated_at = now()
  WHERE estado = 'pospuesta'
    AND pospuesta_hasta IS NOT NULL
    AND pospuesta_hasta <= v_today;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_tareas_automaticas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_matches_tarea_rol(uuid, public.tarea_rol) TO authenticated;