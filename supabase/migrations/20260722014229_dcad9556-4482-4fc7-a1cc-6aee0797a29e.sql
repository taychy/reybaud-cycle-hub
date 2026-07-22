-- 1) Fix RPC: exclude any cancelada* state so expired holds don't block slots
CREATE OR REPLACE FUNCTION public.get_reservas_turnera_ocupadas(p_servicio_id uuid, p_desde date, p_hasta date)
 RETURNS TABLE(fecha date, hora_inicio time without time zone, coach_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.fecha, r.hora_inicio, r.coach_id
  FROM public.reservas_turnera r
  WHERE r.fecha >= p_desde
    AND r.fecha <= p_hasta
    AND COALESCE(r.estado_operativo, '') NOT LIKE 'cancelada%'
    AND r.coach_id IN (
      SELECT DISTINCT dc.coach_id
      FROM public.disponibilidad_coaches dc
      WHERE dc.servicio_id = p_servicio_id
        AND dc.activo = true
    );
$function$;

-- 2) Fix trigger: use metodo_pago (real column) and trigger credit on pago_estado='aprobado'
CREATE OR REPLACE FUNCTION public.sync_turnera_cuenta_corriente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_concepto text;
  v_precio numeric;
  v_pago numeric;
  v_op text;
  v_is_cancelled boolean;
  v_is_paid boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  v_is_cancelled := COALESCE(NEW.estado_operativo, '') LIKE 'cancelada%';

  IF NEW.alumno_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_precio := COALESCE(NEW.precio_snapshot, 0);
  v_pago := COALESCE(NEW.pago_monto, 0);

  SELECT nombre INTO v_concepto FROM public.servicios_turnera WHERE id = NEW.servicio_id;
  v_concepto := 'Turnera: ' || COALESCE(v_concepto, 'servicio') || ' — ' || to_char(NEW.fecha, 'DD/MM/YYYY') || ' ' || to_char(NEW.hora_inicio, 'HH24:MI');
  v_op := 'reserva_turnera:' || NEW.id::text;

  IF v_is_cancelled THEN
    DELETE FROM public.cuenta_ajustes
      WHERE aplicado_a_fuente_tabla = 'reservas_turnera'
        AND aplicado_a_fuente_id = NEW.id
        AND (tipo <> 'credito' OR aplicado_a_fuente_id IS NULL OR referencia_externa = v_op);
    RETURN NEW;
  END IF;

  -- Cargo (deuda)
  IF v_precio > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.cuenta_ajustes
      WHERE aplicado_a_fuente_tabla = 'reservas_turnera'
        AND aplicado_a_fuente_id = NEW.id
        AND tipo = 'cargo'
    ) THEN
      INSERT INTO public.cuenta_ajustes (alumno_id, tipo, concepto, monto, moneda, fecha, notas, referencia_externa, aplicado_a_fuente_tabla, aplicado_a_fuente_id)
      VALUES (NEW.alumno_id, 'cargo', v_concepto, v_precio, COALESCE(NEW.moneda_snapshot, 'ARS'), NEW.fecha, 'Alta automática desde reserva de turnera', v_op, 'reservas_turnera', NEW.id);
    ELSE
      UPDATE public.cuenta_ajustes
        SET monto = v_precio, concepto = v_concepto, moneda = COALESCE(NEW.moneda_snapshot, 'ARS'), fecha = NEW.fecha
        WHERE aplicado_a_fuente_tabla = 'reservas_turnera'
          AND aplicado_a_fuente_id = NEW.id
          AND tipo = 'cargo';
    END IF;
  END IF;

  -- Considerar pagado si estado_economico='pagado' o pago_estado='aprobado'
  v_is_paid := COALESCE(NEW.estado_economico, '') = 'pagado' OR COALESCE(NEW.pago_estado, '') = 'aprobado';

  IF v_is_paid AND v_pago > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.cuenta_ajustes
      WHERE aplicado_a_fuente_tabla = 'reservas_turnera'
        AND aplicado_a_fuente_id = NEW.id
        AND tipo = 'credito'
    ) THEN
      INSERT INTO public.cuenta_ajustes (alumno_id, tipo, concepto, monto, moneda, fecha, notas, medio_pago, referencia_externa, aplicado_a_fuente_tabla, aplicado_a_fuente_id)
      VALUES (NEW.alumno_id, 'credito', 'Pago ' || v_concepto, v_pago, COALESCE(NEW.moneda_snapshot, 'ARS'), NEW.fecha, 'Pago registrado desde turnera', COALESCE(NEW.metodo_pago, 'otro'), v_op, 'reservas_turnera', NEW.id);
    ELSE
      UPDATE public.cuenta_ajustes
        SET monto = v_pago, medio_pago = COALESCE(NEW.metodo_pago, medio_pago), fecha = NEW.fecha
        WHERE aplicado_a_fuente_tabla = 'reservas_turnera'
          AND aplicado_a_fuente_id = NEW.id
          AND tipo = 'credito';
    END IF;
  ELSIF NOT v_is_paid THEN
    DELETE FROM public.cuenta_ajustes
      WHERE aplicado_a_fuente_tabla = 'reservas_turnera'
        AND aplicado_a_fuente_id = NEW.id
        AND tipo = 'credito'
        AND referencia_externa = v_op;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) Restore public/anon read access to active coaches (needed by public booking flow via coaches_public view).
-- The view is security_invoker=on, so anon needs a matching policy on coaches. Only exposes non-sensitive columns via the view.
DROP POLICY IF EXISTS "Public can view active coaches" ON public.coaches;
CREATE POLICY "Public can view active coaches"
ON public.coaches
FOR SELECT
TO anon, authenticated
USING (estado = 'activo');

GRANT SELECT ON public.coaches TO anon;

-- 4) Backfill: sync cuenta corriente for reservas already 'aprobado' but not reflected
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.reservas_turnera
    WHERE pago_estado = 'aprobado'
      AND alumno_id IS NOT NULL
      AND COALESCE(estado_operativo, '') NOT LIKE 'cancelada%'
  LOOP
    UPDATE public.reservas_turnera SET updated_at = now() WHERE id = r.id;
  END LOOP;
END $$;