-- =========================================================
-- 1) BAJAS: eliminar ambigüedad de columnas vs parámetros OUT
-- =========================================================

CREATE OR REPLACE FUNCTION public.confirm_baja_alumno(p_solicitud_id uuid, p_notas text DEFAULT NULL::text, p_email_notificar boolean DEFAULT true)
 RETURNS TABLE(alumno_id uuid, mp_preapproval_ids text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sol record;
  v_motivo_label text;
  v_preapprovals text[];
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo admin puede confirmar bajas';
  END IF;

  SELECT bs.* INTO v_sol FROM public.bajas_solicitudes bs WHERE bs.id = p_solicitud_id FOR UPDATE;
  IF v_sol IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF v_sol.estado <> 'solicitada' THEN
    RAISE EXCEPTION 'La solicitud ya no está pendiente (estado: %)', v_sol.estado;
  END IF;

  v_motivo_label := 'Baja del alumno — ' || v_sol.motivo;

  SELECT COALESCE(array_agg(DISTINCT s.mp_preapproval_id), ARRAY[]::text[])
  INTO v_preapprovals
  FROM public.suscripciones s
  WHERE s.alumno_id = v_sol.alumno_id
    AND s.cancelada_at IS NULL
    AND s.mp_preapproval_id IS NOT NULL
    AND s.estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','pausa');

  UPDATE public.suscripciones s
  SET estado = 'cancelada',
      cancelada_at = now(),
      cancelada_motivo = v_motivo_label,
      auto_renovacion = false,
      auto_cobro_activo = false,
      updated_at = now()
  WHERE s.alumno_id = v_sol.alumno_id
    AND s.cancelada_at IS NULL
    AND s.estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','pausa');

  UPDATE public.alumnos a
  SET estado = 'inactivo',
      grupo = 'Sin grupo'::grupo_ciclismo,
      fecha_baja = CURRENT_DATE,
      motivo_baja = v_sol.motivo,
      baja_solicitud_id = v_sol.id,
      baja_confirmada_por_user_id = auth.uid(),
      pause_motivo = NULL,
      pause_fecha_estimada_retorno = NULL,
      updated_at = now()
  WHERE a.id = v_sol.alumno_id;

  UPDATE public.bajas_solicitudes bs
  SET estado = 'confirmada',
      confirmada_at = now(),
      confirmada_por_user_id = auth.uid(),
      confirmada_notas = p_notas,
      email_notificado = p_email_notificar,
      updated_at = now()
  WHERE bs.id = p_solicitud_id;

  UPDATE public.tareas t
  SET estado = 'hecha', cerrada_at = now(),
      nota_cierre = COALESCE(t.nota_cierre, 'Baja confirmada')
  WHERE t.origen = 'baja_solicitada' AND t.entidad_id = p_solicitud_id::text
    AND t.estado IN ('pendiente','en_curso','pospuesta');

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

  alumno_id := v_sol.alumno_id;
  mp_preapproval_ids := v_preapprovals;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dar_baja_directa(p_alumno_id uuid, p_motivo text, p_motivo_otro_detalle text DEFAULT NULL::text, p_comentario text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_email_notificar boolean DEFAULT true)
 RETURNS TABLE(solicitud_id uuid, alumno_id uuid, mp_preapproval_ids text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_solicitud_id uuid;
  v_existing_id uuid;
  v_snap jsonb;
  v_result record;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo admin puede dar baja directa';
  END IF;

  SELECT bs.id INTO v_existing_id
  FROM public.bajas_solicitudes bs
  WHERE bs.alumno_id = p_alumno_id AND bs.estado = 'solicitada'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    v_solicitud_id := v_existing_id;
  ELSE
    SELECT jsonb_build_object(
      'planes_activos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', s.id,
          'plan_nombre', pl.nombre,
          'estado', s.estado,
          'fecha_fin', s.fecha_fin,
          'auto_renovacion', s.auto_renovacion
        ))
        FROM public.suscripciones s
        LEFT JOIN public.planes pl ON pl.id = s.plan_id
        WHERE s.alumno_id = p_alumno_id
          AND s.cancelada_at IS NULL
          AND s.estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','pausa')
      ), '[]'::jsonb),
      'origen_admin_directa', true
    ) INTO v_snap;

    INSERT INTO public.bajas_solicitudes AS bs (
      alumno_id, origen, solicitada_por_user_id, motivo, motivo_otro_detalle, comentario, estado, snapshot
    ) VALUES (
      p_alumno_id, 'admin_directa', auth.uid(),
      COALESCE(p_motivo,'otro'), p_motivo_otro_detalle, p_comentario,
      'solicitada', v_snap
    ) RETURNING bs.id INTO v_solicitud_id;
  END IF;

  SELECT c.alumno_id, c.mp_preapproval_ids INTO v_result
  FROM public.confirm_baja_alumno(v_solicitud_id, p_notas, p_email_notificar) c;

  solicitud_id := v_solicitud_id;
  alumno_id := v_result.alumno_id;
  mp_preapproval_ids := v_result.mp_preapproval_ids;
  RETURN NEXT;
END;
$function$;

-- Fix relacionado: el trigger de sync de WhatsApp insertaba un uuid en tareas.entidad_id (text)
CREATE OR REPLACE FUNCTION public.reconciliar_tarea_whatsapp_grupo(p_alumno_id uuid, p_grupo_previo text, p_nuevo_grupo text, p_actor_uid uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := COALESCE(p_actor_uid, auth.uid());
  v_confirmado text;
  v_alumno record;
  v_tarea public.tareas%ROWTYPE;
  v_found boolean := false;
  v_origen text;
  v_actor text;
  v_dedupe text := 'wa_grupo_' || p_alumno_id::text;
  v_accion text := 'sin_cambio';
  v_tarea_id uuid;
  v_nombre text;
BEGIN
  IF p_nuevo_grupo IS NOT DISTINCT FROM p_grupo_previo THEN
    RETURN jsonb_build_object('accion', 'sin_cambio');
  END IF;

  SELECT * INTO v_alumno FROM public.alumnos WHERE id = p_alumno_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('accion', 'sin_cambio');
  END IF;

  v_nombre := trim(COALESCE(v_alumno.nombre, '') || ' ' || COALESCE(v_alumno.apellido, ''));
  v_confirmado := COALESCE(v_alumno.whatsapp_grupo_confirmado, p_grupo_previo);

  IF v_uid IS NOT NULL THEN
    SELECT NULLIF(trim(COALESCE(a.nombre, '') || ' ' || COALESCE(a.apellido, '')), '')
      INTO v_actor FROM public.alumnos a WHERE a.user_id = v_uid LIMIT 1;
    IF v_actor IS NULL THEN
      SELECT COALESCE(NULLIF(trim(COALESCE(ap.first_name, '') || ' ' || COALESCE(ap.last_name, '')), ''), ap.email)
        INTO v_actor FROM public.admin_profiles ap WHERE ap.user_id = v_uid LIMIT 1;
    END IF;
  END IF;
  v_actor := COALESCE(NULLIF(v_actor, ''), 'Sistema');

  SELECT * INTO v_tarea FROM public.tareas
  WHERE dedupe_key = v_dedupe AND estado <> 'hecha'
  ORDER BY created_at DESC LIMIT 1;
  v_found := FOUND;

  IF v_found THEN
    v_origen := COALESCE(v_tarea.metadata->>'grupo_origen', v_confirmado);
  ELSE
    v_origen := v_confirmado;
  END IF;

  IF p_nuevo_grupo IS NOT DISTINCT FROM v_origen THEN
    IF v_found THEN
      UPDATE public.tareas
      SET estado = 'hecha',
          nota_cierre = 'Cancelada automáticamente: el alumno volvió al grupo ' || COALESCE(v_origen, 'sin grupo'),
          cerrada_por = v_uid,
          cerrada_at = now(),
          metadata = v_tarea.metadata || jsonb_build_object('grupo_destino', p_nuevo_grupo, 'auto_cancelada', true),
          updated_at = now()
      WHERE id = v_tarea.id;
      INSERT INTO public.tareas_historial (tarea_id, accion, estado_anterior, estado_nuevo, nota, changed_by)
      VALUES (v_tarea.id, 'auto_cancelada', v_tarea.estado, 'hecha', 'El alumno volvió al grupo original', v_uid);
      v_accion := 'cancelada';
      v_tarea_id := v_tarea.id;
    END IF;
    RETURN jsonb_build_object('accion', v_accion, 'tarea_id', v_tarea_id, 'grupo_origen', v_origen, 'grupo_destino', p_nuevo_grupo);
  END IF;

  IF v_found THEN
    UPDATE public.tareas
    SET titulo = 'WhatsApp · cambio de grupo: ' || v_nombre,
        descripcion = 'Quitar a ' || v_nombre
          || ' del grupo de WhatsApp ' || COALESCE(v_origen, 'sin grupo')
          || ' y agregarlo al grupo ' || COALESCE(p_nuevo_grupo, 'sin grupo')
          || '. Cambio hecho por ' || v_actor || ' el ' || to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') || '.',
        metadata = v_tarea.metadata || jsonb_build_object(
          'alumno_id', p_alumno_id,
          'alumno_nombre', v_nombre,
          'grupo_origen', v_origen,
          'grupo_destino', p_nuevo_grupo,
          'cambiado_por', v_uid,
          'cambiado_por_nombre', v_actor,
          'cambiado_at', now(),
          'auto_cancelada', false
        ),
        estado = CASE WHEN v_tarea.estado = 'pospuesta' THEN 'pendiente'::tarea_estado ELSE v_tarea.estado END,
        updated_at = now()
    WHERE id = v_tarea.id;
    INSERT INTO public.tareas_historial (tarea_id, accion, estado_anterior, estado_nuevo, nota, changed_by)
    VALUES (v_tarea.id, 'actualizada', v_tarea.estado, v_tarea.estado,
            'Nuevo destino: ' || COALESCE(p_nuevo_grupo, 'sin grupo') || ' (antes ' || COALESCE(p_grupo_previo, 'sin grupo') || ')', v_uid);
    v_accion := 'actualizada';
    v_tarea_id := v_tarea.id;
  ELSE
    INSERT INTO public.tareas (
      tipo, origen, titulo, descripcion, rol_destino, prioridad,
      entidad_tipo, entidad_id, dedupe_key, created_by, metadata
    ) VALUES (
      'automatica', 'whatsapp_grupo',
      'WhatsApp · cambio de grupo: ' || v_nombre,
      'Quitar a ' || v_nombre
        || ' del grupo de WhatsApp ' || COALESCE(v_origen, 'sin grupo')
        || ' y agregarlo al grupo ' || COALESCE(p_nuevo_grupo, 'sin grupo')
        || '. Cambio hecho por ' || v_actor || ' el ' || to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') || '.',
      'admin', 'media',
      'alumno', p_alumno_id::text, v_dedupe, v_uid,
      jsonb_build_object(
        'alumno_id', p_alumno_id,
        'alumno_nombre', v_nombre,
        'grupo_origen', v_origen,
        'grupo_destino', p_nuevo_grupo,
        'cambiado_por', v_uid,
        'cambiado_por_nombre', v_actor,
        'cambiado_at', now(),
        'auto_cancelada', false
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id INTO v_tarea_id;
    v_accion := CASE WHEN v_tarea_id IS NULL THEN 'sin_cambio' ELSE 'creada' END;
  END IF;

  RETURN jsonb_build_object('accion', v_accion, 'tarea_id', v_tarea_id, 'grupo_origen', v_origen, 'grupo_destino', p_nuevo_grupo);
END;
$function$;

-- =========================================================
-- 2) IMPUTACIONES: normalización de tipo + validaciones
-- =========================================================

CREATE OR REPLACE FUNCTION public.obligacion_tipo_normalizado(_tipo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE lower(trim(coalesce(_tipo, '')))
    WHEN 'reservation' THEN 'reserva'
    WHEN 'reserva'     THEN 'reserva'
    WHEN 'cargo'       THEN 'otro'
    WHEN 'ajuste'      THEN 'otro'
    WHEN 'cuenta_ajuste' THEN 'otro'
    WHEN 'suscripcion' THEN 'suscripcion'
    WHEN 'subscription' THEN 'suscripcion'
    WHEN 'store_order' THEN 'store_order'
    WHEN 'turnera'     THEN 'turnera'
    WHEN 'otro'        THEN 'otro'
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.obligacion_alumno(_tipo text, _id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE public.obligacion_tipo_normalizado(_tipo)
    WHEN 'suscripcion' THEN (SELECT s.alumno_id FROM public.suscripciones s WHERE s.id = _id)
    WHEN 'reserva'     THEN (SELECT r.alumno_id FROM public.event_reservations r WHERE r.id = _id)
    WHEN 'store_order' THEN (SELECT o.alumno_id FROM public.store_orders o WHERE o.id = _id)
    WHEN 'turnera'     THEN (SELECT t.alumno_id FROM public.reservas_turnera t WHERE t.id = _id)
    WHEN 'otro'        THEN (SELECT c.alumno_id FROM public.cuenta_ajustes c WHERE c.id = _id)
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.obligacion_moneda(_tipo text, _id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE public.obligacion_tipo_normalizado(_tipo)
    WHEN 'suscripcion' THEN (SELECT COALESCE(p.moneda, 'ARS') FROM public.suscripciones s
                              LEFT JOIN public.planes p ON p.id = s.plan_id WHERE s.id = _id)
    WHEN 'reserva'     THEN (SELECT COALESCE(r.currency_snapshot, r.moneda, 'ARS') FROM public.event_reservations r WHERE r.id = _id)
    WHEN 'store_order' THEN (SELECT COALESCE(o.currency, 'ARS') FROM public.store_orders o WHERE o.id = _id)
    WHEN 'turnera'     THEN 'ARS'
    WHEN 'otro'        THEN (SELECT COALESCE(c.moneda, 'ARS') FROM public.cuenta_ajustes c WHERE c.id = _id)
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.obligacion_imputado(_tipo text, _id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(pi.monto), 0)
  FROM public.pagos_imputaciones pi
  WHERE pi.obligacion_tipo = public.obligacion_tipo_normalizado(_tipo)
    AND pi.obligacion_id = _id
    AND pi.anulado_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.obligacion_saldo_pendiente(_tipo text, _id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.obligacion_monto(public.obligacion_tipo_normalizado(_tipo), _id) IS NULL THEN NULL
    ELSE public.obligacion_monto(public.obligacion_tipo_normalizado(_tipo), _id)
         - public.obligacion_imputado(_tipo, _id)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.aplicar_saldo_disponible(_pago_origen_tipo text, _pago_origen_id uuid, _obligacion_tipo text, _obligacion_id uuid, _monto numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alumno uuid; v_moneda text; v_disp numeric; v_id uuid; v_existente numeric := 0;
  v_tipo text; v_ob_alumno uuid; v_ob_moneda text; v_ob_pend numeric;
BEGIN
  IF NOT public._programa_admin_ok() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF _monto IS NULL OR _monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;

  -- Normalización defensiva de aliases legacy ('reservation' -> 'reserva', 'cargo' -> 'otro')
  v_tipo := public.obligacion_tipo_normalizado(_obligacion_tipo);
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'Tipo de obligación no soportado: %', _obligacion_tipo;
  END IF;

  SELECT v.alumno_id, v.moneda, v.disponible INTO v_alumno, v_moneda, v_disp
    FROM public.vw_pagos_disponibles v
   WHERE v.pago_origen_tipo = _pago_origen_tipo AND v.pago_origen_id = _pago_origen_id;
  IF v_alumno IS NULL THEN RAISE EXCEPTION 'Pago no encontrado o sin alumno asignado'; END IF;

  -- La obligación debe existir y pertenecer al mismo alumno
  v_ob_alumno := public.obligacion_alumno(v_tipo, _obligacion_id);
  IF public.obligacion_monto(v_tipo, _obligacion_id) IS NULL THEN
    RAISE EXCEPTION 'Obligación no encontrada';
  END IF;
  IF v_ob_alumno IS NOT NULL AND v_ob_alumno <> v_alumno THEN
    RAISE EXCEPTION 'La obligación pertenece a otro alumno';
  END IF;

  -- Misma moneda
  v_ob_moneda := public.obligacion_moneda(v_tipo, _obligacion_id);
  IF v_ob_moneda IS NOT NULL AND v_moneda IS NOT NULL AND upper(v_ob_moneda) <> upper(v_moneda) THEN
    RAISE EXCEPTION 'La moneda del pago (%) no coincide con la de la obligación (%)', v_moneda, v_ob_moneda;
  END IF;

  -- Idempotencia: si ya existe la misma imputación activa por el mismo monto, no se duplica.
  SELECT pi.monto INTO v_existente FROM public.pagos_imputaciones pi
   WHERE pi.pago_origen_tipo = _pago_origen_tipo AND pi.pago_origen_id = _pago_origen_id
     AND pi.obligacion_tipo = v_tipo AND pi.obligacion_id = _obligacion_id
     AND pi.anulado_at IS NULL;

  IF v_existente IS NULL THEN
    IF ROUND(_monto,2) > ROUND(v_disp,2) THEN
      RAISE EXCEPTION 'El monto a aplicar (%) supera el saldo disponible del pago (%)', _monto, v_disp;
    END IF;

    v_ob_pend := public.obligacion_saldo_pendiente(v_tipo, _obligacion_id);
    IF v_ob_pend IS NOT NULL AND ROUND(_monto,2) > ROUND(v_ob_pend,2) + 0.01 THEN
      RAISE EXCEPTION 'El monto a aplicar (%) supera el saldo pendiente de la obligación (%)', _monto, v_ob_pend;
    END IF;
  END IF;

  v_id := public.imputar_pago(_pago_origen_tipo, _pago_origen_id, v_tipo, _obligacion_id,
            v_alumno, _monto, v_moneda, jsonb_build_object('origen','saldo_disponible',
              'obligacion_tipo_recibido', _obligacion_tipo));

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), NULL, 'admin', 'aplicar_saldo_disponible', 'pagos_imputaciones', v_id::text,
    jsonb_build_object('alumno_id', v_alumno, 'pago_origen_tipo', _pago_origen_tipo,
      'pago_origen_id', _pago_origen_id, 'obligacion_tipo', v_tipo,
      'obligacion_tipo_recibido', _obligacion_tipo,
      'obligacion_id', _obligacion_id, 'monto', _monto));

  RETURN jsonb_build_object('imputacion_id', v_id, 'alumno_id', v_alumno, 'monto', _monto,
    'obligacion_tipo', v_tipo,
    'disponible_restante', public.pago_saldo_disponible(_pago_origen_tipo, _pago_origen_id));
END; $function$;

REVOKE ALL ON FUNCTION public.obligacion_tipo_normalizado(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obligacion_alumno(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obligacion_moneda(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obligacion_imputado(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obligacion_saldo_pendiente(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obligacion_tipo_normalizado(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obligacion_alumno(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obligacion_moneda(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obligacion_imputado(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obligacion_saldo_pendiente(text, uuid) TO authenticated, service_role;