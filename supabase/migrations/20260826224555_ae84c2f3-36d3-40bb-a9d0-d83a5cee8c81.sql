-- 1) Coach WhatsApp phone
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS whatsapp text;

-- 2) Per-service WhatsApp toggles (safe defaults: OFF)
ALTER TABLE public.servicios_turnera
  ADD COLUMN IF NOT EXISTS whatsapp_recordatorio_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_coach_recordatorio_enabled boolean NOT NULL DEFAULT false;

-- 3) Unified notification log for turnera (reserva + tipo + canal)
CREATE TABLE IF NOT EXISTS public.turnera_notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id uuid NOT NULL REFERENCES public.reservas_turnera(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  canal text NOT NULL CHECK (canal IN ('email','whatsapp')),
  destinatario text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'scheduled' CHECK (estado IN ('scheduled','queued','sent','error','skipped')),
  idempotency_key text NOT NULL,
  provider text,
  provider_message_id text,
  error_code text,
  error_message text,
  scheduled_for timestamptz,
  queued_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turnera_notificaciones_idem_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_turnera_notif_reserva ON public.turnera_notificaciones(reserva_id);

GRANT SELECT ON public.turnera_notificaciones TO authenticated;
GRANT ALL ON public.turnera_notificaciones TO service_role;

ALTER TABLE public.turnera_notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins leen avisos de turnera" ON public.turnera_notificaciones;
CREATE POLICY "Admins leen avisos de turnera"
ON public.turnera_notificaciones FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_turnera_notif_updated_at ON public.turnera_notificaciones;
CREATE TRIGGER trg_turnera_notif_updated_at
BEFORE UPDATE ON public.turnera_notificaciones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Full server-side availability validation on reservation creation
CREATE OR REPLACE FUNCTION public.create_turnera_reservation(
  p_reservation_id uuid, p_servicio_id uuid, p_coach_id uuid, p_sede_id uuid,
  p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone,
  p_nombre text, p_apellido text, p_email text, p_celular text, p_documento text,
  p_fecha_nacimiento date, p_nota text, p_acepto_politica boolean, p_origen_link text,
  p_form_responses jsonb DEFAULT '{}'::jsonb, p_alumno_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_precio numeric;
  v_moneda text;
  v_dur int;
  v_antic int;
  v_activo boolean;
  v_conflict boolean;
  v_dow int;
  v_has_block boolean;
  v_has_replace boolean;
  v_in_window boolean;
  v_ausente boolean;
BEGIN
  IF p_hora_fin <= p_hora_inicio THEN
    RAISE EXCEPTION 'Horario inválido.';
  END IF;

  SELECT precio, moneda, duracion_minutos, COALESCE(anticipacion_horas_minima, 24), COALESCE(activo, false)
    INTO v_precio, v_moneda, v_dur, v_antic, v_activo
  FROM public.servicios_turnera WHERE id = p_servicio_id;

  IF v_dur IS NULL OR NOT v_activo THEN
    RAISE EXCEPTION 'El servicio no está disponible.';
  END IF;

  -- Duración exacta del servicio
  IF EXTRACT(EPOCH FROM (p_hora_fin - p_hora_inicio)) / 60 <> v_dur THEN
    RAISE EXCEPTION 'La duración del turno no coincide con el servicio.';
  END IF;

  -- Anticipación mínima (hora local AR = UTC-3)
  IF (p_fecha + p_hora_inicio) < ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires') + make_interval(hours => v_antic)) THEN
    RAISE EXCEPTION 'Ese turno ya no cumple la anticipación mínima. Elegí otro turno.';
  END IF;

  v_dow := EXTRACT(DOW FROM p_fecha)::int;

  -- Ajustes del día para ese coach (o globales)
  SELECT EXISTS (SELECT 1 FROM public.disponibilidad_ajustada a
                 WHERE a.fecha = p_fecha AND (a.coach_id IS NULL OR a.coach_id = p_coach_id)
                   AND a.tipo = 'bloquear')
    INTO v_has_block;
  IF v_has_block THEN
    RAISE EXCEPTION 'Ese horario ya no está disponible. Elegí otro turno.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.disponibilidad_ajustada a
                 WHERE a.fecha = p_fecha AND (a.coach_id IS NULL OR a.coach_id = p_coach_id)
                   AND a.tipo = 'reemplazar' AND a.hora_inicio IS NOT NULL AND a.hora_fin IS NOT NULL)
    INTO v_has_replace;

  -- El turno debe caer dentro de un rango efectivo (base / reemplazo / extra)
  SELECT EXISTS (
    SELECT 1 FROM public.disponibilidad_ajustada a
    WHERE a.fecha = p_fecha AND (a.coach_id IS NULL OR a.coach_id = p_coach_id)
      AND a.tipo IN ('reemplazar','agregar')
      AND a.hora_inicio IS NOT NULL AND a.hora_fin IS NOT NULL
      AND p_hora_inicio >= a.hora_inicio AND p_hora_fin <= a.hora_fin
  ) OR (
    NOT v_has_replace AND EXISTS (
      SELECT 1 FROM public.disponibilidad_coaches d
      WHERE d.coach_id = p_coach_id AND d.servicio_id = p_servicio_id
        AND d.dia_semana = v_dow AND COALESCE(d.activo, false)
        AND p_hora_inicio >= d.hora_inicio AND p_hora_fin <= d.hora_fin
        AND (p_sede_id IS NULL OR d.sede_id IS NULL OR d.sede_id = p_sede_id)
    )
  ) INTO v_in_window;

  IF NOT v_in_window THEN
    RAISE EXCEPTION 'Ese horario ya no está disponible. Elegí otro turno.';
  END IF;

  -- Ausencias del coach
  SELECT EXISTS (
    SELECT 1 FROM public.ausencias_coaches x
    WHERE x.coach_id = p_coach_id
      AND p_fecha BETWEEN x.fecha_inicio AND x.fecha_fin
      AND (COALESCE(x.todo_el_dia, true) OR x.hora_inicio IS NULL OR x.hora_fin IS NULL
           OR (p_hora_inicio < x.hora_fin AND p_hora_fin > x.hora_inicio))
  ) INTO v_ausente;
  IF v_ausente THEN
    RAISE EXCEPTION 'Ese horario ya no está disponible. Elegí otro turno.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_coach_id::text || p_fecha::text, 0));

  SELECT EXISTS (
    SELECT 1 FROM public.reservas_turnera r
    WHERE r.coach_id = p_coach_id
      AND r.fecha = p_fecha
      AND COALESCE(r.estado_operativo, '') NOT LIKE 'cancelada%'
      AND p_hora_inicio < r.hora_fin
      AND p_hora_fin > r.hora_inicio
  ) INTO v_conflict;

  IF v_conflict THEN
    RAISE EXCEPTION 'Ese horario acaba de ocuparse. Elegí otro turno.';
  END IF;

  INSERT INTO public.reservas_turnera (
    id, servicio_id, coach_id, sede_id, alumno_id, fecha, hora_inicio, hora_fin,
    nombre, apellido, email, celular, documento, fecha_nacimiento, nota,
    acepto_politica, precio_snapshot, moneda_snapshot, origen_link, form_responses
  ) VALUES (
    COALESCE(p_reservation_id, gen_random_uuid()), p_servicio_id, p_coach_id, p_sede_id, p_alumno_id,
    p_fecha, p_hora_inicio, p_hora_fin,
    p_nombre, p_apellido, p_email, p_celular, p_documento, p_fecha_nacimiento, p_nota,
    COALESCE(p_acepto_politica, false), v_precio, COALESCE(v_moneda, 'ARS'), p_origen_link,
    COALESCE(p_form_responses, '{}'::jsonb)
  );

  RETURN COALESCE(p_reservation_id, (SELECT id FROM public.reservas_turnera WHERE id = p_reservation_id));
END;
$function$;