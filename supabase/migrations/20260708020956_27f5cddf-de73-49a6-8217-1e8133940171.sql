
-- 1. MP fees en reservation_payments
ALTER TABLE public.reservation_payments
  ADD COLUMN IF NOT EXISTS mp_payment_id text,
  ADD COLUMN IF NOT EXISTS comision_mp numeric,
  ADD COLUMN IF NOT EXISTS iibb numeric,
  ADD COLUMN IF NOT EXISTS otros_fees numeric,
  ADD COLUMN IF NOT EXISTS neto_recibido numeric,
  ADD COLUMN IF NOT EXISTS fees_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_reservation_payments_mp_payment_id
  ON public.reservation_payments(mp_payment_id) WHERE mp_payment_id IS NOT NULL;

-- 2. MP fees en suscripciones
ALTER TABLE public.suscripciones
  ADD COLUMN IF NOT EXISTS comision_mp numeric,
  ADD COLUMN IF NOT EXISTS iibb numeric,
  ADD COLUMN IF NOT EXISTS otros_fees numeric,
  ADD COLUMN IF NOT EXISTS neto_recibido numeric,
  ADD COLUMN IF NOT EXISTS fees_synced_at timestamptz;

-- 3. MP fees en store_orders
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS comision_mp numeric,
  ADD COLUMN IF NOT EXISTS iibb numeric,
  ADD COLUMN IF NOT EXISTS otros_fees numeric,
  ADD COLUMN IF NOT EXISTS neto_recibido numeric,
  ADD COLUMN IF NOT EXISTS fees_synced_at timestamptz;

-- 4. event_id en gastos, recurrentes y ejecuciones
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_event_id ON public.gastos(event_id) WHERE event_id IS NOT NULL;

ALTER TABLE public.gastos_recurrentes
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_recurrentes_event_id ON public.gastos_recurrentes(event_id) WHERE event_id IS NOT NULL;

ALTER TABLE public.gastos_ejecuciones
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_ejecuciones_event_id ON public.gastos_ejecuciones(event_id) WHERE event_id IS NOT NULL;

-- 5. Trigger: propagar event_id de recurrente a ejecución al insertar
CREATE OR REPLACE FUNCTION public.propagate_event_id_to_ejecucion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_id IS NULL AND NEW.recurrente_id IS NOT NULL THEN
    SELECT event_id INTO NEW.event_id
    FROM public.gastos_recurrentes
    WHERE id = NEW.recurrente_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_event_id_ejecucion ON public.gastos_ejecuciones;
CREATE TRIGGER trg_propagate_event_id_ejecucion
  BEFORE INSERT ON public.gastos_ejecuciones
  FOR EACH ROW EXECUTE FUNCTION public.propagate_event_id_to_ejecucion();

-- Y también al pagar un ejecución (crea gasto): si el ejecución tiene event_id, propagarlo al gasto
CREATE OR REPLACE FUNCTION public.propagate_event_id_ejec_to_gasto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF NEW.gasto_id IS NOT NULL AND (OLD.gasto_id IS NULL OR OLD.gasto_id <> NEW.gasto_id) THEN
    IF NEW.event_id IS NOT NULL THEN
      UPDATE public.gastos SET event_id = NEW.event_id
      WHERE id = NEW.gasto_id AND event_id IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_event_id_ejec_to_gasto ON public.gastos_ejecuciones;
CREATE TRIGGER trg_propagate_event_id_ejec_to_gasto
  AFTER UPDATE ON public.gastos_ejecuciones
  FOR EACH ROW EXECUTE FUNCTION public.propagate_event_id_ejec_to_gasto();

-- 6. Vista consolidada de ingresos netos
CREATE OR REPLACE VIEW public.v_ingresos_netos AS
SELECT
  'reserva'::text AS origen,
  rp.id AS referencia_id,
  rp.reservation_id AS ref_padre_id,
  er.event_id AS event_id,
  rp.alumno_id,
  rp.amount AS bruto,
  COALESCE(rp.comision_mp, 0) + COALESCE(rp.iibb, 0) + COALESCE(rp.otros_fees, 0) AS comision_total,
  COALESCE(rp.neto_recibido, rp.amount) AS neto,
  rp.currency AS moneda,
  rp.payment_date AS fecha,
  rp.payment_method AS metodo,
  rp.mp_payment_id,
  rp.status AS estado,
  rp.fees_synced_at
FROM public.reservation_payments rp
LEFT JOIN public.event_reservations er ON er.id = rp.reservation_id
WHERE rp.status = 'validado' AND COALESCE(rp.anulado_at::text, '') = ''

UNION ALL

SELECT
  'suscripcion'::text AS origen,
  s.id AS referencia_id,
  s.plan_id AS ref_padre_id,
  NULL::uuid AS event_id,
  s.alumno_id,
  s.precio_final AS bruto,
  COALESCE(s.comision_mp, 0) + COALESCE(s.iibb, 0) + COALESCE(s.otros_fees, 0) AS comision_total,
  COALESCE(s.neto_recibido, s.precio_final) AS neto,
  'ARS'::text AS moneda,
  s.fecha_inicio AS fecha,
  s.metodo_pago AS metodo,
  s.mp_payment_id,
  s.estado,
  s.fees_synced_at
FROM public.suscripciones s
WHERE s.estado IN ('activa', 'conciliado') AND s.mp_payment_id IS NOT NULL

UNION ALL

SELECT
  'tienda'::text AS origen,
  o.id AS referencia_id,
  NULL::uuid AS ref_padre_id,
  NULL::uuid AS event_id,
  o.alumno_id,
  o.total AS bruto,
  COALESCE(o.comision_mp, 0) + COALESCE(o.iibb, 0) + COALESCE(o.otros_fees, 0) AS comision_total,
  COALESCE(o.neto_recibido, o.total) AS neto,
  o.currency AS moneda,
  COALESCE(o.pagado_at::date, o.created_at::date) AS fecha,
  o.metodo_pago AS metodo,
  o.mp_payment_id,
  o.status AS estado,
  o.fees_synced_at
FROM public.store_orders o
WHERE o.status IN ('pagado', 'entregado');

GRANT SELECT ON public.v_ingresos_netos TO authenticated;
GRANT SELECT ON public.v_ingresos_netos TO service_role;
