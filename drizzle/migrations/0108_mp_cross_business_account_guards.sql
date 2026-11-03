-- Protección preventiva de cobros entre unidades de negocio.
-- No modifica movimientos históricos; actúa únicamente ante imputaciones nuevas.
-- Fuentes: cuenta_mp_routing, unidad_routing, mp_account_movements y referencias reales.
--
-- ATENCIÓN: desplegar primero en staging y probar la ruta de aplicación de créditos.
-- Los cobros recibidos en cuentas sin ruteo configurado requieren revisión de administración.

CREATE OR REPLACE FUNCTION public.mp_account_accepts_unit(
  p_account uuid, p_unit text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cuenta_mp_routing r
    WHERE r.cuenta_mp_id=p_account AND r.activa
      AND (
        (p_unit='viajes' AND r.unidad_negocio::text IN ('viaje_camp','evento'))
        OR (p_unit='tienda' AND r.unidad_negocio::text IN ('tienda','preventa'))
        OR (p_unit='escuela' AND r.unidad_negocio::text IN ('suscripcion_escuela','personalizado','turnera'))
      )
  ) OR EXISTS (
    SELECT 1 FROM public.unidad_routing r
    WHERE r.cuenta_mp_id=p_account AND r.activa
      AND (
        (p_unit='viajes' AND r.unidad::text='viaje_camp')
        OR (p_unit='tienda' AND r.unidad::text='tienda')
        OR (p_unit='escuela' AND r.unidad::text='suscripcion_escuela')
      )
  );
$$;
REVOKE ALL ON FUNCTION public.mp_account_accepts_unit(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mp_account_accepts_unit(uuid,text) TO service_role;

-- Evita que la UI, RPCs u otros procesos asignen a evento/escuela
-- un movimiento que ya corresponde a Tienda o tiene un crédito pendiente.
CREATE OR REPLACE FUNCTION public.guard_mp_movement_destination()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_unit text;
  v_res uuid;
  v_notes text;
BEGIN
  IF NEW.reservation_payment_id IS NOT DISTINCT FROM OLD.reservation_payment_id
    AND NEW.suscripcion_id IS NOT DISTINCT FROM OLD.suscripcion_id THEN
    RETURN NEW;
  END IF;
  IF NEW.reservation_payment_id IS NULL AND NEW.suscripcion_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_unit := CASE WHEN NEW.reservation_payment_id IS NOT NULL THEN 'viajes' ELSE 'escuela' END;
  IF NOT public.mp_account_accepts_unit(NEW.cuenta_mp_id,v_unit) THEN
    RAISE EXCEPTION 'mp_wrong_business_account: cobro recibido en una cuenta distinta de %',v_unit;
  END IF;
  IF NEW.reservation_payment_id IS NOT NULL THEN
    SELECT rp.reservation_id,rp.notes INTO v_res,v_notes
    FROM public.reservation_payments rp WHERE rp.id=NEW.reservation_payment_id;
    IF v_res IS NULL THEN RAISE EXCEPTION 'mp_reservation_payment_missing'; END IF;
  END IF;
  IF NEW.reservation_payment_id IS NOT NULL
    AND (
      coalesce(NEW.external_reference,'') LIKE 'store_order:%'
      OR coalesce(NEW.external_reference,'') LIKE 'preorder%'
      OR coalesce(NEW.raw->'metadata'->>'payment_type','')
         IN ('store_order','preorder','preorder_total','preorder_saldo')
    ) THEN
      RAISE EXCEPTION 'mp_store_payment_cannot_pay_event';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.store_orders so
    WHERE so.cancelled_at IS NULL AND so.pagado_at IS NOT NULL
      AND (so.cuenta_mp_id=NEW.cuenta_mp_id OR so.cuenta_mp_id IS NULL)
      AND (
        so.mp_payment_id=NEW.mp_payment_id
        OR (NEW.mp_payment_id ~ '^[0-9]{8,}$'
          AND coalesce(so.notes,'') ~ ('(^|[^0-9])'||NEW.mp_payment_id||'([^0-9]|$)'))
      )
  ) THEN
    RAISE EXCEPTION 'mp_already_used_in_store: operación aplicada a un pedido de Tienda';
  END IF;
  IF NEW.reservation_payment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.cuenta_ajustes ca
    WHERE ca.tipo='credito' AND ca.monto>0
      AND ca.referencia_externa=NEW.mp_payment_id
      AND ca.cuenta_mp_id=NEW.cuenta_mp_id
      AND upper(ca.moneda)=upper(NEW.currency)
      AND NOT (
        (ca.aplicado_a_fuente_tabla IN ('event_reservations','reservation')
         AND ca.aplicado_a_fuente_id=v_res::text)
        OR position(ca.id::text in coalesce(v_notes,''))>0
      )
  ) THEN
    RAISE EXCEPTION 'mp_existing_credit: aplicá el crédito ya registrado desde cuenta corriente';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_mp_movement_destination() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_mp_movement_destination() TO service_role;
DROP TRIGGER IF EXISTS trg_guard_mp_movement_destination ON public.mp_account_movements;
CREATE TRIGGER trg_guard_mp_movement_destination
BEFORE UPDATE OF reservation_payment_id,suscripcion_id
ON public.mp_account_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_mp_movement_destination();

-- Cubre pagos de reserva insertados directamente, incluso si el vínculo
-- al movimiento se crea posteriormente. No bloquea pagos sin número MP comprobado.
CREATE OR REPLACE FUNCTION public.guard_reservation_payment_origin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_ref text;
  v_mp public.mp_account_movements%ROWTYPE;
BEGIN
  IF NEW.anulado_at IS NOT NULL OR NEW.status='rechazado' THEN RETURN NEW; END IF;
  v_ref:=coalesce(nullif(trim(NEW.mp_payment_id),''),nullif(trim(NEW.payment_reference),''));
  IF v_ref IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_mp FROM public.mp_account_movements
  WHERE mp_payment_id=v_ref
    AND (NEW.cuenta_mp_id IS NULL OR cuenta_mp_id=NEW.cuenta_mp_id)
  ORDER BY fecha_movimiento DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NOT public.mp_account_accepts_unit(v_mp.cuenta_mp_id,'viajes') THEN
    RAISE EXCEPTION 'mp_wrong_business_account: este cobro no corresponde a Viajes';
  END IF;
  IF coalesce(v_mp.external_reference,'') LIKE 'store_order:%'
    OR coalesce(v_mp.external_reference,'') LIKE 'preorder%'
    OR coalesce(v_mp.raw->'metadata'->>'payment_type','')
         IN ('store_order','preorder','preorder_total','preorder_saldo')
    OR EXISTS (
      SELECT 1 FROM public.store_orders so
      WHERE so.pagado_at IS NOT NULL AND so.cancelled_at IS NULL
        AND (so.cuenta_mp_id=v_mp.cuenta_mp_id OR so.cuenta_mp_id IS NULL)
        AND (so.mp_payment_id=v_ref
          OR (v_ref ~ '^[0-9]{8,}$'
           AND coalesce(so.notes,'') ~ ('(^|[^0-9])'||v_ref||'([^0-9]|$)')))
    ) THEN
      RAISE EXCEPTION 'mp_already_used_in_store: este cobro ya corresponde a Tienda';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_reservation_payment_origin() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_reservation_payment_origin() TO service_role;
DROP TRIGGER IF EXISTS trg_guard_reservation_payment_origin ON public.reservation_payments;
CREATE TRIGGER trg_guard_reservation_payment_origin
BEFORE INSERT OR UPDATE OF mp_payment_id,payment_reference,cuenta_mp_id,status
ON public.reservation_payments
FOR EACH ROW EXECUTE FUNCTION public.guard_reservation_payment_origin();

-- El alta manual de un pago de Tienda reconoce la operación bancaria
-- aunque se haya escrito como "Ref: 177..." en las notas, como sucedió en #74.
CREATE OR REPLACE FUNCTION public.guard_store_order_mp_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_ref text;
  v_mp public.mp_account_movements%ROWTYPE;
BEGIN
  IF NEW.pagado_at IS NULL OR NEW.cancelled_at IS NOT NULL THEN RETURN NEW; END IF;
  v_ref:=coalesce(nullif(trim(NEW.mp_payment_id),''),
     substring(coalesce(NEW.notes,'') FROM '[Rr]ef:[[:space:]]*([0-9]{8,})'));
  IF v_ref IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_mp FROM public.mp_account_movements
  WHERE mp_payment_id=v_ref
  ORDER BY fecha_movimiento DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.cuenta_mp_id IS NOT NULL AND NEW.cuenta_mp_id<>v_mp.cuenta_mp_id THEN
    RAISE EXCEPTION 'mp_store_receiving_account_mismatch';
  END IF;
  IF NOT public.mp_account_accepts_unit(v_mp.cuenta_mp_id,'tienda') THEN
    RAISE EXCEPTION 'mp_wrong_business_account: esta operación no corresponde a Tienda';
  END IF;
  IF v_mp.reservation_payment_id IS NOT NULL OR v_mp.suscripcion_id IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.reservation_payments rp
       WHERE (rp.mp_payment_id=v_ref OR rp.payment_reference=v_ref)
         AND rp.anulado_at IS NULL AND rp.status<>'rechazado'
     )
     OR EXISTS (
       SELECT 1 FROM public.cuenta_ajustes ca
       WHERE ca.tipo='credito' AND ca.monto>0
         AND ca.referencia_externa=v_ref
         AND ca.cuenta_mp_id=v_mp.cuenta_mp_id
         AND (ca.aplicado_a_fuente_tabla IS DISTINCT FROM 'store_orders'
              OR ca.aplicado_a_fuente_id IS DISTINCT FROM NEW.id)
     )
  THEN RAISE EXCEPTION 'mp_already_allocated: usá el crédito existente; no registres otro pago'; END IF;
  NEW.mp_payment_id:=v_ref;
  NEW.cuenta_mp_id:=v_mp.cuenta_mp_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_store_order_mp_reference() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_store_order_mp_reference() TO service_role;
DROP TRIGGER IF EXISTS trg_guard_store_order_mp_reference ON public.store_orders;
CREATE TRIGGER trg_guard_store_order_mp_reference
BEFORE INSERT OR UPDATE OF pagado_at,mp_payment_id,notes,cuenta_mp_id
ON public.store_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_store_order_mp_reference();

-- Evita crear un segundo crédito con un cobro ya asignado a Tienda y evita
-- trasladar créditos de una cuenta de Tienda a una reserva de Viajes.
CREATE OR REPLACE FUNCTION public.guard_credit_business_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_mp public.mp_account_movements%ROWTYPE;
BEGIN
  IF NEW.tipo<>'credito' OR NEW.referencia_externa IS NULL
     OR NEW.cuenta_mp_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_mp FROM public.mp_account_movements
  WHERE mp_payment_id=NEW.referencia_externa AND cuenta_mp_id=NEW.cuenta_mp_id
    AND upper(currency)=upper(NEW.moneda)
  ORDER BY fecha_movimiento DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.store_orders so
    WHERE so.pagado_at IS NOT NULL AND so.cancelled_at IS NULL
      AND (so.cuenta_mp_id=v_mp.cuenta_mp_id OR so.cuenta_mp_id IS NULL)
      AND (
        so.mp_payment_id=v_mp.mp_payment_id
        OR (v_mp.mp_payment_id ~ '^[0-9]{8,}$'
          AND coalesce(so.notes,'') ~ ('(^|[^0-9])'||v_mp.mp_payment_id||'([^0-9]|$)'))
      )
      AND NOT (NEW.aplicado_a_fuente_tabla='store_orders' AND NEW.aplicado_a_fuente_id=so.id::text)
  ) THEN RAISE EXCEPTION 'mp_already_used_in_store: operación de Tienda no disponible como crédito general'; END IF;
  IF NEW.aplicado_a_fuente_tabla IN ('event_reservations','reservation')
     AND NEW.aplicado_a_fuente_id IS NOT NULL
     AND NOT public.mp_account_accepts_unit(v_mp.cuenta_mp_id,'viajes') THEN
    RAISE EXCEPTION 'mp_credit_wrong_business: un crédito de otra cuenta no puede pagar Viajes';
  END IF;
  IF NEW.aplicado_a_fuente_tabla IN ('store_orders','store_preorders')
     AND NEW.aplicado_a_fuente_id IS NOT NULL
     AND NOT public.mp_account_accepts_unit(v_mp.cuenta_mp_id,'tienda') THEN
    RAISE EXCEPTION 'mp_credit_wrong_business: un crédito de otra cuenta no puede pagar Tienda';
  END IF;
  IF NEW.aplicado_a_fuente_tabla IN ('suscripciones','suscripcion')
     AND NEW.aplicado_a_fuente_id IS NOT NULL
     AND NOT public.mp_account_accepts_unit(v_mp.cuenta_mp_id,'escuela') THEN
    RAISE EXCEPTION 'mp_credit_wrong_business: un crédito de otra cuenta no puede pagar Escuela';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_credit_business_account() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_credit_business_account() TO service_role;
DROP TRIGGER IF EXISTS trg_guard_credit_business_account ON public.cuenta_ajustes;
CREATE TRIGGER trg_guard_credit_business_account
BEFORE INSERT OR UPDATE OF referencia_externa,cuenta_mp_id,monto,tipo,aplicado_a_fuente_id,aplicado_a_fuente_tabla
ON public.cuenta_ajustes
FOR EACH ROW EXECUTE FUNCTION public.guard_credit_business_account();