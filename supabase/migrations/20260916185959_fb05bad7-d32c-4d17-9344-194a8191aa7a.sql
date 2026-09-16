CREATE OR REPLACE FUNCTION public.guard_suscripcion_student_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo aplica a actualizaciones directas desde la app con rol 'authenticated'.
  -- Las funciones SECURITY DEFINER (RPCs internos) y service_role quedan exentas.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Columnas que el alumno nunca puede modificar
  IF NEW.alumno_id IS DISTINCT FROM OLD.alumno_id
     OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.fecha_inicio IS DISTINCT FROM OLD.fecha_inicio
     OR NEW.precio_base IS DISTINCT FROM OLD.precio_base
     OR NEW.precio_final IS DISTINCT FROM OLD.precio_final
     OR NEW.descuento_id IS DISTINCT FROM OLD.descuento_id
     OR NEW.metodo_pago IS DISTINCT FROM OLD.metodo_pago
     OR NEW.origen_registro IS DISTINCT FROM OLD.origen_registro
     OR NEW.notas IS DISTINCT FROM OLD.notas
     OR NEW.mp_preference_id IS DISTINCT FROM OLD.mp_preference_id
     OR NEW.mp_payment_id IS DISTINCT FROM OLD.mp_payment_id
     OR NEW.mp_status IS DISTINCT FROM OLD.mp_status
     OR NEW.mp_status_detail IS DISTINCT FROM OLD.mp_status_detail
     OR NEW.mp_error_code IS DISTINCT FROM OLD.mp_error_code
     OR NEW.mp_error_message IS DISTINCT FROM OLD.mp_error_message
     OR NEW.mp_preapproval_id IS DISTINCT FROM OLD.mp_preapproval_id
     OR NEW.cuenta_mp_id IS DISTINCT FROM OLD.cuenta_mp_id
     OR NEW.chequeado_admin IS DISTINCT FROM OLD.chequeado_admin
     OR NEW.chequeado_admin_at IS DISTINCT FROM OLD.chequeado_admin_at
     OR NEW.chequeado_admin_by IS DISTINCT FROM OLD.chequeado_admin_by
     OR NEW.baja_nota IS DISTINCT FROM OLD.baja_nota
     OR NEW.baja_chequeada IS DISTINCT FROM OLD.baja_chequeada
     OR NEW.baja_chequeada_at IS DISTINCT FROM OLD.baja_chequeada_at
     OR NEW.baja_chequeada_by IS DISTINCT FROM OLD.baja_chequeada_by
     OR NEW.clases_totales IS DISTINCT FROM OLD.clases_totales
     OR NEW.clases_consumidas IS DISTINCT FROM OLD.clases_consumidas
     OR NEW.clases_vencimiento IS DISTINCT FROM OLD.clases_vencimiento
     OR NEW.comision_mp IS DISTINCT FROM OLD.comision_mp
     OR NEW.iibb IS DISTINCT FROM OLD.iibb
     OR NEW.otros_fees IS DISTINCT FROM OLD.otros_fees
     OR NEW.neto_recibido IS DISTINCT FROM OLD.neto_recibido
     OR NEW.fees_synced_at IS DISTINCT FROM OLD.fees_synced_at
     OR NEW.intentos_cobro_fallidos IS DISTINCT FROM OLD.intentos_cobro_fallidos
     OR NEW.ultimo_intento_cobro_at IS DISTINCT FROM OLD.ultimo_intento_cobro_at
     OR NEW.precio_excepcion_motivo IS DISTINCT FROM OLD.precio_excepcion_motivo
     OR NEW.precio_excepcion_autorizado_por IS DISTINCT FROM OLD.precio_excepcion_autorizado_por
     OR NEW.precio_excepcion_at IS DISTINCT FROM OLD.precio_excepcion_at
     OR NEW.precio_excepcion_tipo IS DISTINCT FROM OLD.precio_excepcion_tipo
     OR NEW.precio_excepcion_valor IS DISTINCT FROM OLD.precio_excepcion_valor
     OR NEW.precio_excepcion_vigencia_hasta IS DISTINCT FROM OLD.precio_excepcion_vigencia_hasta
  THEN
    RAISE EXCEPTION 'SUSCRIPCION_FIELD_FORBIDDEN: solo administracion puede modificar datos economicos o de control de la suscripcion';
  END IF;

  -- Estado: el alumno solo puede cancelar
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado <> 'cancelada' THEN
    RAISE EXCEPTION 'SUSCRIPCION_ESTADO_FORBIDDEN: el alumno solo puede cancelar su suscripcion';
  END IF;

  -- Renovacion / cobro automatico: solo se pueden desactivar desde la app
  IF NEW.auto_renovacion IS DISTINCT FROM OLD.auto_renovacion AND COALESCE(NEW.auto_renovacion, false) THEN
    RAISE EXCEPTION 'SUSCRIPCION_AUTORENOVACION_FORBIDDEN: la renovacion automatica se activa desde Mercado Pago';
  END IF;

  IF NEW.auto_cobro_activo IS DISTINCT FROM OLD.auto_cobro_activo AND COALESCE(NEW.auto_cobro_activo, false) THEN
    RAISE EXCEPTION 'SUSCRIPCION_AUTOCOBRO_FORBIDDEN: el cobro automatico se activa desde Mercado Pago';
  END IF;

  IF NEW.mp_preapproval_status IS DISTINCT FROM OLD.mp_preapproval_status
     AND COALESCE(NEW.mp_preapproval_status, '') <> 'cancelled' THEN
    RAISE EXCEPTION 'SUSCRIPCION_PREAPPROVAL_FORBIDDEN: estado de autorizacion gestionado por Mercado Pago';
  END IF;

  -- fecha_fin solo puede cambiar al cancelar (fin de pausa)
  IF NEW.fecha_fin IS DISTINCT FROM OLD.fecha_fin AND COALESCE(NEW.estado, '') <> 'cancelada' THEN
    RAISE EXCEPTION 'SUSCRIPCION_PERIODO_FORBIDDEN: el periodo lo define administracion';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_suscripcion_student_update ON public.suscripciones;
CREATE TRIGGER trg_guard_suscripcion_student_update
BEFORE UPDATE ON public.suscripciones
FOR EACH ROW EXECUTE FUNCTION public.guard_suscripcion_student_update();