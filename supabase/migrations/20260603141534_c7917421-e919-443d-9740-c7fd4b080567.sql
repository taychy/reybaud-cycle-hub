-- =====================================================
-- BAJAS DE ALUMNOS — Flujo dual (alumno solicita / admin confirma)
-- =====================================================

-- 1) Tabla bajas_solicitudes
CREATE TABLE IF NOT EXISTS public.bajas_solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  origen text NOT NULL CHECK (origen IN ('alumno','admin')),
  solicitada_por_user_id uuid,
  motivo text NOT NULL CHECK (motivo IN (
    'economico','horarios','lesion_salud','viaje_vacaciones',
    'cambio_actividad','disconforme_servicio','otro'
  )),
  motivo_otro_detalle text,
  comentario text,
  estado text NOT NULL DEFAULT 'solicitada' CHECK (estado IN (
    'solicitada','confirmada','evitada','cancelada_por_alumno'
  )),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmada_at timestamptz,
  confirmada_por_user_id uuid,
  confirmada_notas text,
  email_notificado boolean NOT NULL DEFAULT false,
  evitada_at timestamptz,
  evitada_motivo text,
  evitada_por_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bajas_solicitudes_alumno ON public.bajas_solicitudes(alumno_id);
CREATE INDEX IF NOT EXISTS idx_bajas_solicitudes_estado ON public.bajas_solicitudes(estado);
CREATE INDEX IF NOT EXISTS idx_bajas_solicitudes_created ON public.bajas_solicitudes(created_at DESC);
-- Solo una solicitud abierta por alumno
CREATE UNIQUE INDEX IF NOT EXISTS uq_bajas_solicitudes_abierta
  ON public.bajas_solicitudes(alumno_id)
  WHERE estado = 'solicitada';

GRANT SELECT, INSERT, UPDATE ON public.bajas_solicitudes TO authenticated;
GRANT ALL ON public.bajas_solicitudes TO service_role;

ALTER TABLE public.bajas_solicitudes ENABLE ROW LEVEL SECURITY;

-- Alumno ve y crea/cancela las suyas
CREATE POLICY "Alumno ve sus propias solicitudes"
ON public.bajas_solicitudes
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.alumnos a WHERE a.id = alumno_id AND lower(a.email) = lower(auth.email()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Alumno o admin pueden insertar"
ON public.bajas_solicitudes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.alumnos a WHERE a.id = alumno_id AND lower(a.email) = lower(auth.email()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admin update; alumno solo cancela la suya pendiente"
ON public.bajas_solicitudes
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    EXISTS (SELECT 1 FROM public.alumnos a WHERE a.id = alumno_id AND lower(a.email) = lower(auth.email()))
    AND estado = 'solicitada'
  )
);

-- Trigger updated_at
CREATE TRIGGER trg_bajas_solicitudes_updated_at
BEFORE UPDATE ON public.bajas_solicitudes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Columnas en alumnos
ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS fecha_baja date,
  ADD COLUMN IF NOT EXISTS motivo_baja text,
  ADD COLUMN IF NOT EXISTS baja_solicitud_id uuid REFERENCES public.bajas_solicitudes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS baja_confirmada_por_user_id uuid,
  ADD COLUMN IF NOT EXISTS reactivada_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivada_por_user_id uuid;

-- 3) Helper: construir snapshot para una baja
CREATE OR REPLACE FUNCTION public.build_baja_snapshot(p_alumno_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planes jsonb;
  v_saldo jsonb;
  v_reservas jsonb;
  v_auto_renov boolean;
  v_antiguedad_dias integer;
  v_first_sub date;
  v_today date := CURRENT_DATE;
BEGIN
  -- Planes activos
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'suscripcion_id', s.id,
    'plan_id', s.plan_id,
    'plan_nombre', p.nombre,
    'estado', s.estado,
    'fecha_inicio', s.fecha_inicio,
    'fecha_fin', s.fecha_fin,
    'auto_renovacion', s.auto_renovacion,
    'mp_preapproval_id', s.mp_preapproval_id
  )), '[]'::jsonb)
  INTO v_planes
  FROM public.suscripciones s
  JOIN public.planes p ON p.id = s.plan_id
  WHERE s.alumno_id = p_alumno_id
    AND s.cancelada_at IS NULL
    AND s.estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','pausa');

  v_auto_renov := EXISTS (
    SELECT 1 FROM public.suscripciones s
    WHERE s.alumno_id = p_alumno_id
      AND s.cancelada_at IS NULL
      AND COALESCE(s.auto_renovacion, false) = true
  );

  -- Saldo por moneda (puede fallar si no hay vista accesible — captura)
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'moneda', m.moneda, 'saldo', (COALESCE(SUM(m.debe),0) - COALESCE(SUM(m.haber),0))
    )), '[]'::jsonb)
    INTO v_saldo
    FROM public.vw_cuenta_corriente_movimientos m
    WHERE m.alumno_id = p_alumno_id
    GROUP BY m.moneda;
  EXCEPTION WHEN OTHERS THEN
    v_saldo := '[]'::jsonb;
  END;
  v_saldo := COALESCE(v_saldo, '[]'::jsonb);

  -- Reservas futuras
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reservation_id', er.id,
    'event_id', er.event_id,
    'event_title', e.title,
    'event_date', e.date,
    'reservation_status', er.reservation_status,
    'payment_status', er.payment_status,
    'balance_due', er.balance_due
  )), '[]'::jsonb)
  INTO v_reservas
  FROM public.event_reservations er
  JOIN public.events e ON e.id = er.event_id
  WHERE er.alumno_id = p_alumno_id
    AND COALESCE(er.cancelled_at, NULL) IS NULL
    AND COALESCE(e.date, v_today) >= v_today;

  -- Antigüedad (desde primera suscripción)
  SELECT MIN(COALESCE(s.fecha_inicio, s.created_at::date))
  INTO v_first_sub
  FROM public.suscripciones s
  WHERE s.alumno_id = p_alumno_id;
  v_antiguedad_dias := CASE WHEN v_first_sub IS NULL THEN NULL ELSE (v_today - v_first_sub) END;

  RETURN jsonb_build_object(
    'planes_activos', v_planes,
    'saldo_por_moneda', v_saldo,
    'reservas_futuras', v_reservas,
    'auto_renovacion_activa', v_auto_renov,
    'antiguedad_dias', v_antiguedad_dias,
    'snapshot_at', now()
  );
END;
$$;

-- 4) RPC request_baja_alumno
CREATE OR REPLACE FUNCTION public.request_baja_alumno(
  p_alumno_id uuid,
  p_motivo text,
  p_motivo_otro_detalle text DEFAULT NULL,
  p_comentario text DEFAULT NULL,
  p_origen text DEFAULT 'alumno'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_is_admin boolean;
  v_is_owner boolean;
  v_snapshot jsonb;
BEGIN
  IF p_motivo IS NULL OR p_motivo = '' THEN
    RAISE EXCEPTION 'Motivo obligatorio';
  END IF;
  IF p_motivo NOT IN ('economico','horarios','lesion_salud','viaje_vacaciones','cambio_actividad','disconforme_servicio','otro') THEN
    RAISE EXCEPTION 'Motivo inválido: %', p_motivo;
  END IF;
  IF p_origen NOT IN ('alumno','admin') THEN
    RAISE EXCEPTION 'Origen inválido';
  END IF;

  v_is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  SELECT EXISTS (
    SELECT 1 FROM public.alumnos a
    WHERE a.id = p_alumno_id AND lower(a.email) = lower(auth.email())
  ) INTO v_is_owner;

  IF NOT (v_is_admin OR v_is_owner) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Si ya hay una solicitada abierta, devolverla
  SELECT id INTO v_id FROM public.bajas_solicitudes
  WHERE alumno_id = p_alumno_id AND estado = 'solicitada' LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  v_snapshot := public.build_baja_snapshot(p_alumno_id);

  INSERT INTO public.bajas_solicitudes (
    alumno_id, origen, solicitada_por_user_id, motivo, motivo_otro_detalle, comentario, snapshot
  ) VALUES (
    p_alumno_id,
    CASE WHEN v_is_admin AND p_origen = 'admin' THEN 'admin' ELSE 'alumno' END,
    auth.uid(),
    p_motivo, p_motivo_otro_detalle, p_comentario, v_snapshot
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 5) RPC cancelar_solicitud_baja (alumno se arrepiente o admin descarta)
CREATE OR REPLACE FUNCTION public.cancelar_solicitud_baja(p_solicitud_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol record;
  v_is_admin boolean;
  v_is_owner boolean;
BEGIN
  SELECT * INTO v_sol FROM public.bajas_solicitudes WHERE id = p_solicitud_id;
  IF v_sol IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF v_sol.estado <> 'solicitada' THEN
    RAISE EXCEPTION 'La solicitud ya no está pendiente';
  END IF;

  v_is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  SELECT EXISTS (
    SELECT 1 FROM public.alumnos a
    WHERE a.id = v_sol.alumno_id AND lower(a.email) = lower(auth.email())
  ) INTO v_is_owner;

  IF NOT (v_is_admin OR v_is_owner) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.bajas_solicitudes
  SET estado = 'cancelada_por_alumno',
      updated_at = now()
  WHERE id = p_solicitud_id;

  -- Cerrar tarea relacionada
  UPDATE public.tareas
  SET estado = 'hecha', cerrada_at = now(),
      nota_cierre = COALESCE(nota_cierre, 'Solicitud cancelada')
  WHERE origen = 'baja_solicitada' AND entidad_id = p_solicitud_id::text
    AND estado IN ('pendiente','en_curso','pospuesta');
END;
$$;

-- 6) RPC marcar_baja_evitada
CREATE OR REPLACE FUNCTION public.marcar_baja_evitada(
  p_solicitud_id uuid,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo admin';
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Motivo requerido';
  END IF;

  UPDATE public.bajas_solicitudes
  SET estado = 'evitada',
      evitada_at = now(),
      evitada_motivo = p_motivo,
      evitada_por_user_id = auth.uid(),
      updated_at = now()
  WHERE id = p_solicitud_id AND estado = 'solicitada';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada o ya cerrada';
  END IF;

  UPDATE public.tareas
  SET estado = 'hecha', cerrada_at = now(),
      nota_cierre = COALESCE(nota_cierre, 'Alumno retenido: ' || p_motivo)
  WHERE origen = 'baja_solicitada' AND entidad_id = p_solicitud_id::text
    AND estado IN ('pendiente','en_curso','pospuesta');
END;
$$;

-- 7) RPC confirm_baja_alumno — devuelve preapprovals MP a cancelar
CREATE OR REPLACE FUNCTION public.confirm_baja_alumno(
  p_solicitud_id uuid,
  p_notas text DEFAULT NULL,
  p_email_notificar boolean DEFAULT true
)
RETURNS TABLE(alumno_id uuid, mp_preapproval_ids text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol record;
  v_motivo_label text;
  v_preapprovals text[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo admin puede confirmar bajas';
  END IF;

  SELECT * INTO v_sol FROM public.bajas_solicitudes WHERE id = p_solicitud_id FOR UPDATE;
  IF v_sol IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF v_sol.estado <> 'solicitada' THEN
    RAISE EXCEPTION 'La solicitud ya no está pendiente (estado: %)', v_sol.estado;
  END IF;

  v_motivo_label := 'Baja del alumno — ' || v_sol.motivo;

  -- Recolectar preapprovals MP activos antes de cancelar
  SELECT COALESCE(array_agg(DISTINCT s.mp_preapproval_id), ARRAY[]::text[])
  INTO v_preapprovals
  FROM public.suscripciones s
  WHERE s.alumno_id = v_sol.alumno_id
    AND s.cancelada_at IS NULL
    AND s.mp_preapproval_id IS NOT NULL
    AND s.estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','pausa');

  -- Cancelar todas las suscripciones operativas
  UPDATE public.suscripciones
  SET estado = 'cancelada',
      cancelada_at = now(),
      cancelada_motivo = v_motivo_label,
      auto_renovacion = false,
      auto_cobro_activo = false,
      updated_at = now()
  WHERE alumno_id = v_sol.alumno_id
    AND cancelada_at IS NULL
    AND estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','pausa');

  -- Pasar alumno a inactivo
  UPDATE public.alumnos
  SET estado = 'inactivo',
      grupo = 'Sin grupo'::grupo_ciclismo,
      fecha_baja = CURRENT_DATE,
      motivo_baja = v_sol.motivo,
      baja_solicitud_id = v_sol.id,
      baja_confirmada_por_user_id = auth.uid(),
      pause_motivo = NULL,
      pause_fecha_estimada_retorno = NULL,
      updated_at = now()
  WHERE id = v_sol.alumno_id;

  -- Marcar la solicitud confirmada
  UPDATE public.bajas_solicitudes
  SET estado = 'confirmada',
      confirmada_at = now(),
      confirmada_por_user_id = auth.uid(),
      confirmada_notas = p_notas,
      email_notificado = p_email_notificar,
      updated_at = now()
  WHERE id = p_solicitud_id;

  -- Cerrar tarea
  UPDATE public.tareas
  SET estado = 'hecha', cerrada_at = now(),
      nota_cierre = COALESCE(nota_cierre, 'Baja confirmada')
  WHERE origen = 'baja_solicitada' AND entidad_id = p_solicitud_id::text
    AND estado IN ('pendiente','en_curso','pospuesta');

  -- Audit
  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), auth.email(), 'admin', 'baja_alumno_confirmada',
    'alumno', v_sol.alumno_id::text,
    jsonb_build_object(
      'solicitud_id', v_sol.id,
      'motivo', v_sol.motivo,
      'origen_solicitud', v_sol.origen,
      'preapprovals_a_cancelar', v_preapprovals,
      'email_notificar', p_email_notificar
    )
  );

  RETURN QUERY SELECT v_sol.alumno_id, v_preapprovals;
END;
$$;

-- 8) RPC reactivar_alumno (no restaura suscripciones)
CREATE OR REPLACE FUNCTION public.reactivar_alumno(p_alumno_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo admin';
  END IF;

  UPDATE public.alumnos
  SET estado = 'activo',
      grupo = 'Sin grupo'::grupo_ciclismo,
      fecha_baja = NULL,
      motivo_baja = NULL,
      reactivada_at = now(),
      reactivada_por_user_id = auth.uid(),
      updated_at = now()
  WHERE id = p_alumno_id;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), 'admin', 'alumno_reactivado', 'alumno', p_alumno_id::text,
    jsonb_build_object('note', 'Reactivación sin restaurar suscripciones'));
END;
$$;

-- 9) Trigger: crear tarea al recibir solicitud nueva
CREATE OR REPLACE FUNCTION public.trg_baja_solicitada_crear_tarea()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alumno record;
BEGIN
  SELECT id, nombre, apellido INTO v_alumno FROM public.alumnos WHERE id = NEW.alumno_id;

  INSERT INTO public.tareas (
    tipo, origen, titulo, descripcion, rol_destino, prioridad,
    entidad_tipo, entidad_id, dedupe_key, metadata
  ) VALUES (
    'automatica', 'baja_solicitada',
    'Solicitud de baja: ' || COALESCE(v_alumno.nombre,'') || ' ' || COALESCE(v_alumno.apellido,''),
    'El alumno solicitó la baja. Motivo: ' || NEW.motivo ||
      CASE WHEN NEW.comentario IS NOT NULL THEN '. Comentario: ' || NEW.comentario ELSE '' END,
    'admin', 'alta'::tarea_prioridad,
    'baja_solicitud', NEW.id::text,
    'baja_solicitada:' || NEW.id::text,
    jsonb_build_object('alumno_id', NEW.alumno_id, 'motivo', NEW.motivo, 'origen', NEW.origen)
  ) ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_baja_solicitada_tarea ON public.bajas_solicitudes;
CREATE TRIGGER trg_baja_solicitada_tarea
AFTER INSERT ON public.bajas_solicitudes
FOR EACH ROW
WHEN (NEW.estado = 'solicitada')
EXECUTE FUNCTION public.trg_baja_solicitada_crear_tarea();

-- 10) Vista métricas mensuales
CREATE OR REPLACE VIEW public.vw_bajas_metricas_mensuales AS
WITH base AS (
  SELECT
    to_char(b.created_at, 'YYYY-MM') AS mes,
    b.id,
    b.motivo,
    b.estado,
    b.origen,
    b.alumno_id,
    b.snapshot,
    b.confirmada_at,
    (b.snapshot->>'auto_renovacion_activa')::boolean AS auto_renov,
    (b.snapshot->>'antiguedad_dias')::int AS antiguedad_dias,
    -- ¿tenía deuda? = algún saldo > 0
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(b.snapshot->'saldo_por_moneda','[]'::jsonb)) s
      WHERE (s->>'saldo')::numeric > 0
    ) AS con_deuda
  FROM public.bajas_solicitudes b
)
SELECT
  mes,
  COUNT(*) FILTER (WHERE TRUE) AS solicitadas,
  COUNT(*) FILTER (WHERE estado = 'confirmada') AS confirmadas,
  COUNT(*) FILTER (WHERE estado = 'evitada') AS evitadas,
  COUNT(*) FILTER (WHERE estado = 'cancelada_por_alumno') AS canceladas_por_alumno,
  COUNT(*) FILTER (WHERE estado = 'solicitada') AS pendientes,
  COUNT(*) FILTER (WHERE auto_renov) AS con_auto_renovacion,
  COUNT(*) FILTER (WHERE con_deuda) AS con_deuda,
  ROUND(AVG(antiguedad_dias)::numeric, 0) AS antiguedad_promedio_dias,
  jsonb_object_agg(motivo, cnt) AS por_motivo
FROM (
  SELECT mes, motivo, estado, auto_renov, antiguedad_dias, con_deuda,
         COUNT(*) OVER (PARTITION BY mes, motivo) AS cnt
  FROM base
) sub
GROUP BY mes
ORDER BY mes DESC;

GRANT SELECT ON public.vw_bajas_metricas_mensuales TO authenticated;
GRANT SELECT ON public.vw_bajas_metricas_mensuales TO service_role;