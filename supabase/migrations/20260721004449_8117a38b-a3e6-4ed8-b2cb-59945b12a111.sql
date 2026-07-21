
CREATE OR REPLACE FUNCTION public.sync_turnera_cuenta_corriente()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_concepto text;
  v_precio numeric;
  v_pago numeric;
  v_op text;
  v_is_cancelled boolean;
  v_was_cancelled boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  v_is_cancelled := COALESCE(NEW.estado_operativo, '') LIKE 'cancelada%';
  v_was_cancelled := TG_OP = 'UPDATE' AND COALESCE(OLD.estado_operativo, '') LIKE 'cancelada%';

  -- Sin alumno vinculado o sin precio, no hay nada que reflejar.
  IF NEW.alumno_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_precio := COALESCE(NEW.precio_snapshot, 0);
  v_pago := COALESCE(NEW.pago_monto, 0);

  SELECT nombre INTO v_concepto FROM public.servicios_turnera WHERE id = NEW.servicio_id;
  v_concepto := 'Turnera: ' || COALESCE(v_concepto, 'servicio') || ' — ' || to_char(NEW.fecha, 'DD/MM/YYYY') || ' ' || to_char(NEW.hora_inicio, 'HH24:MI');
  v_op := 'reserva_turnera:' || NEW.id::text;

  -- Reserva cancelada: intentar revertir movimientos que aún no se aplicaron a otras deudas.
  IF v_is_cancelled THEN
    DELETE FROM public.cuenta_ajustes
      WHERE aplicado_a_fuente_tabla = 'reservas_turnera'
        AND aplicado_a_fuente_id = NEW.id
        AND (tipo <> 'credito' OR aplicado_a_fuente_id IS NULL OR referencia_externa = v_op);
    -- El crédito puede haberse consumido; en ese caso lo dejamos y queda como saldo aplicado histórico.
    RETURN NEW;
  END IF;

  -- Cargo (deuda) por el precio de la reserva.
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
      -- Actualiza monto/concepto si cambió
      UPDATE public.cuenta_ajustes
        SET monto = v_precio, concepto = v_concepto, moneda = COALESCE(NEW.moneda_snapshot, 'ARS'), fecha = NEW.fecha
        WHERE aplicado_a_fuente_tabla = 'reservas_turnera'
          AND aplicado_a_fuente_id = NEW.id
          AND tipo = 'cargo';
    END IF;
  END IF;

  -- Crédito (pago) si la reserva está pagada.
  IF NEW.estado_economico = 'pagado' AND v_pago > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.cuenta_ajustes
      WHERE aplicado_a_fuente_tabla = 'reservas_turnera'
        AND aplicado_a_fuente_id = NEW.id
        AND tipo = 'credito'
    ) THEN
      INSERT INTO public.cuenta_ajustes (alumno_id, tipo, concepto, monto, moneda, fecha, notas, medio_pago, referencia_externa, aplicado_a_fuente_tabla, aplicado_a_fuente_id)
      VALUES (NEW.alumno_id, 'credito', 'Pago ' || v_concepto, v_pago, COALESCE(NEW.moneda_snapshot, 'ARS'), NEW.fecha, 'Pago registrado desde turnera', COALESCE(NEW.pago_metodo, 'otro'), v_op, 'reservas_turnera', NEW.id);
    ELSE
      UPDATE public.cuenta_ajustes
        SET monto = v_pago, medio_pago = COALESCE(NEW.pago_metodo, medio_pago), fecha = NEW.fecha
        WHERE aplicado_a_fuente_tabla = 'reservas_turnera'
          AND aplicado_a_fuente_id = NEW.id
          AND tipo = 'credito';
    END IF;
  ELSIF NEW.estado_economico <> 'pagado' THEN
    -- Si vuelve a no pagado, quitamos el crédito auto-generado (solo el nuestro, referencia_externa)
    DELETE FROM public.cuenta_ajustes
      WHERE aplicado_a_fuente_tabla = 'reservas_turnera'
        AND aplicado_a_fuente_id = NEW.id
        AND tipo = 'credito'
        AND referencia_externa = v_op;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_turnera_cuenta_corriente ON public.reservas_turnera;
CREATE TRIGGER trg_sync_turnera_cuenta_corriente
AFTER INSERT OR UPDATE ON public.reservas_turnera
FOR EACH ROW EXECUTE FUNCTION public.sync_turnera_cuenta_corriente();

-- Backfill: reservas existentes con alumno vinculado que aún no tienen movimientos en cuenta corriente.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT rt.* FROM public.reservas_turnera rt
    WHERE rt.alumno_id IS NOT NULL
      AND COALESCE(rt.estado_operativo, '') NOT LIKE 'cancelada%'
      AND COALESCE(rt.precio_snapshot, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.cuenta_ajustes ca
        WHERE ca.aplicado_a_fuente_tabla = 'reservas_turnera' AND ca.aplicado_a_fuente_id = rt.id
      )
  LOOP
    UPDATE public.reservas_turnera SET updated_at = now() WHERE id = r.id;
  END LOOP;
END $$;
