-- Devoluciones a participantes: gastos sigue siendo la única fuente de verdad del egreso.
-- devoluciones pasa a ser una proyección semántica del gasto (no otra fuente de dinero).

ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.event_reservations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_egreso text NOT NULL DEFAULT 'gasto';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gastos_tipo_egreso_check') THEN
    ALTER TABLE public.gastos
      ADD CONSTRAINT gastos_tipo_egreso_check
      CHECK (tipo_egreso IN ('gasto', 'devolucion_participante'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gastos_alumno_id ON public.gastos(alumno_id) WHERE alumno_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_reservation_id ON public.gastos(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_tipo_egreso ON public.gastos(tipo_egreso);

ALTER TABLE public.devoluciones
  ADD COLUMN IF NOT EXISTS gasto_id uuid REFERENCES public.gastos(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_devoluciones_gasto_id
  ON public.devoluciones(gasto_id) WHERE gasto_id IS NOT NULL;

COMMENT ON COLUMN public.gastos.tipo_egreso IS
  'gasto = egreso operativo; devolucion_participante = reintegro a un alumno/reserva, proyectado en public.devoluciones';
COMMENT ON COLUMN public.devoluciones.gasto_id IS
  'Gasto matriz del que deriva esta devolución. Único: un gasto no puede ser dos devoluciones.';

-- ------------------------------------------------------------------
-- Vincular un gasto ya existente (por ej. sincronizado desde MP) como
-- devolución de un participante. Idempotente: re-ejecutar actualiza.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vincular_gasto_como_devolucion(
  p_gasto_id uuid,
  p_alumno_id uuid DEFAULT NULL,
  p_reservation_id uuid DEFAULT NULL,
  p_motivo text DEFAULT 'Devolución a participante',
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_g record;
  v_res record;
  v_alumno_id uuid := p_alumno_id;
  v_event_id uuid;
  v_mp_movement_id uuid;
  v_cuenta_mp_id uuid;
  v_devolucion_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo admin puede vincular devoluciones';
  END IF;

  SELECT * INTO v_g FROM public.gastos WHERE id = p_gasto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El gasto no existe';
  END IF;
  IF COALESCE(v_g.monto, 0) <= 0 THEN
    RAISE EXCEPTION 'El gasto debe tener monto mayor a cero';
  END IF;

  IF p_reservation_id IS NOT NULL THEN
    SELECT er.id, er.alumno_id, er.event_id INTO v_res
      FROM public.event_reservations er WHERE er.id = p_reservation_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La reserva no existe';
    END IF;
    IF v_alumno_id IS NULL THEN
      v_alumno_id := v_res.alumno_id;
    ELSIF v_res.alumno_id IS DISTINCT FROM v_alumno_id THEN
      RAISE EXCEPTION 'La reserva pertenece a otro participante';
    END IF;
    v_event_id := v_res.event_id;
    IF v_g.event_id IS NOT NULL AND v_g.event_id IS DISTINCT FROM v_event_id THEN
      RAISE EXCEPTION 'El gasto ya está asociado a otro evento';
    END IF;
  END IF;

  IF v_alumno_id IS NULL THEN
    RAISE EXCEPTION 'Falta el participante';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alumnos a WHERE a.id = v_alumno_id) THEN
    RAISE EXCEPTION 'El participante no existe';
  END IF;

  -- Un gasto no puede quedar como dos devoluciones distintas
  SELECT d.id INTO v_devolucion_id FROM public.devoluciones d WHERE d.gasto_id = p_gasto_id;

  -- Evidencia MP disponible en el gasto
  IF v_g.mp_payment_id IS NOT NULL THEN
    SELECT m.id, m.cuenta_mp_id INTO v_mp_movement_id, v_cuenta_mp_id
      FROM public.mp_account_movements m
     WHERE m.mp_payment_id = v_g.mp_payment_id
     ORDER BY m.fecha_movimiento DESC
     LIMIT 1;
    -- No reutilizar un movimiento MP ya vinculado a otra devolución
    IF v_mp_movement_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.devoluciones d
       WHERE d.mp_movement_id = v_mp_movement_id
         AND (v_devolucion_id IS NULL OR d.id <> v_devolucion_id)
    ) THEN
      v_mp_movement_id := NULL;
      v_cuenta_mp_id := NULL;
    END IF;
  END IF;

  UPDATE public.gastos
     SET tipo_egreso = 'devolucion_participante',
         alumno_id = v_alumno_id,
         reservation_id = COALESCE(p_reservation_id, reservation_id),
         event_id = COALESCE(v_event_id, event_id),
         unidad_negocio = CASE WHEN v_event_id IS NOT NULL AND unidad_negocio = 'compartido'
                               THEN 'viajes' ELSE unidad_negocio END,
         updated_at = now()
   WHERE id = p_gasto_id;

  IF v_devolucion_id IS NULL THEN
    INSERT INTO public.devoluciones (
      alumno_id, monto, moneda, fecha, metodo, referencia, motivo, notas,
      mp_movement_id, cuenta_mp_id, reservation_id, gasto_id, created_by
    ) VALUES (
      v_alumno_id, v_g.monto, COALESCE(v_g.moneda, 'ARS'), v_g.fecha,
      COALESCE(v_g.forma_pago, 'transferencia'),
      COALESCE(v_g.mp_payment_id, v_g.mp_external_reference),
      COALESCE(NULLIF(btrim(p_motivo), ''), 'Devolución a participante'),
      p_notas, v_mp_movement_id, v_cuenta_mp_id, p_reservation_id, p_gasto_id, auth.uid()
    )
    RETURNING id INTO v_devolucion_id;
  ELSE
    UPDATE public.devoluciones
       SET alumno_id = v_alumno_id,
           monto = v_g.monto,
           moneda = COALESCE(v_g.moneda, 'ARS'),
           fecha = v_g.fecha,
           metodo = COALESCE(v_g.forma_pago, 'transferencia'),
           referencia = COALESCE(v_g.mp_payment_id, v_g.mp_external_reference, referencia),
           motivo = COALESCE(NULLIF(btrim(p_motivo), ''), motivo),
           notas = p_notas,
           mp_movement_id = COALESCE(v_mp_movement_id, mp_movement_id),
           cuenta_mp_id = COALESCE(v_cuenta_mp_id, cuenta_mp_id),
           reservation_id = COALESCE(p_reservation_id, reservation_id),
           updated_at = now()
     WHERE id = v_devolucion_id;
  END IF;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), auth.email(), 'admin', 'vincular_gasto_como_devolucion', 'gastos', p_gasto_id::text,
    jsonb_build_object(
      'devolucion_id', v_devolucion_id,
      'alumno_id', v_alumno_id,
      'reservation_id', p_reservation_id,
      'event_id', COALESCE(v_event_id, v_g.event_id),
      'monto', v_g.monto,
      'moneda', COALESCE(v_g.moneda, 'ARS'),
      'motivo', p_motivo
    )
  );

  RETURN v_devolucion_id;
END;
$function$;

-- ------------------------------------------------------------------
-- Desvincular: borra SOLO la proyección semántica, nunca el gasto.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desvincular_gasto_devolucion(p_gasto_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_d record;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo admin puede desvincular devoluciones';
  END IF;

  SELECT * INTO v_d FROM public.devoluciones WHERE gasto_id = p_gasto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese gasto no está vinculado como devolución';
  END IF;

  DELETE FROM public.devoluciones WHERE id = v_d.id;

  UPDATE public.gastos
     SET tipo_egreso = 'gasto',
         alumno_id = NULL,
         reservation_id = NULL,
         updated_at = now()
   WHERE id = p_gasto_id;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), auth.email(), 'admin', 'desvincular_gasto_devolucion', 'gastos', p_gasto_id::text,
    jsonb_build_object(
      'devolucion_id', v_d.id, 'alumno_id', v_d.alumno_id, 'reservation_id', v_d.reservation_id,
      'monto', v_d.monto, 'moneda', v_d.moneda, 'fecha', v_d.fecha, 'motivo', v_d.motivo
    )
  );

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.vincular_gasto_como_devolucion(uuid, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desvincular_gasto_devolucion(uuid) TO authenticated;

-- ------------------------------------------------------------------
-- El reembolso de una reserva sale ahora de las devoluciones reales.
-- ------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_reservation_account AS
SELECT r.id AS reservation_id,
    r.alumno_id,
    r.event_id,
    r.amount_total,
    r.amount_paid,
    r.balance_due,
    r.currency_snapshot AS moneda,
    COALESCE(( SELECT sum(a.monto_disponible)
           FROM reservation_financial_adjustments a
          WHERE a.reservation_id = r.id
            AND a.tipo = ANY (ARRAY['credito_por_downgrade'::text, 'descuento_admin'::text, 'ajuste_manual'::text])
            AND a.estado = 'activo'::text
            AND a.monto_original > 0::numeric), 0::numeric) AS credito_disponible,
    COALESCE(( SELECT sum(a.monto_disponible)
           FROM reservation_financial_adjustments a
          WHERE a.reservation_id = r.id
            AND a.tipo = 'debito_por_upgrade'::text
            AND a.estado = 'activo'::text
            AND a.monto_disponible > 0::numeric), 0::numeric) AS debitos_pendientes,
    COALESCE(( SELECT sum(d.monto)
           FROM devoluciones d
          WHERE d.reservation_id = r.id), 0::numeric) AS reembolsado
   FROM event_reservations r;

ALTER VIEW public.v_reservation_account SET (security_invoker = true);
GRANT SELECT ON public.v_reservation_account TO authenticated;