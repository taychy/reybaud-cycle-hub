DO $$ BEGIN
  CREATE TYPE public.event_payment_mode AS ENUM ('cuotas', 'simple');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS payment_mode public.event_payment_mode NOT NULL DEFAULT 'cuotas';

CREATE TABLE IF NOT EXISTS public.event_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  precio numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  tipo text NOT NULL DEFAULT 'opcional',
  max_por_participante integer DEFAULT 1,
  stock_total integer,
  activo boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_addons_event ON public.event_addons(event_id);
ALTER TABLE public.event_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_addons readable by everyone" ON public.event_addons FOR SELECT USING (true);
CREATE POLICY "event_addons admin insert" ON public.event_addons FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "event_addons admin update" ON public.event_addons FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "event_addons admin delete" ON public.event_addons FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_event_addons_updated_at BEFORE UPDATE ON public.event_addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.reservation_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  addon_id uuid NOT NULL REFERENCES public.event_addons(id) ON DELETE RESTRICT,
  cantidad integer NOT NULL DEFAULT 1,
  precio_unitario numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  notas text,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservation_addons_reservation ON public.reservation_addons(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_addons_addon ON public.reservation_addons(addon_id);
ALTER TABLE public.reservation_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservation_addons owner or admin select" ON public.reservation_addons FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.event_reservations er
      JOIN public.alumnos a ON a.id = er.alumno_id
      WHERE er.id = reservation_addons.reservation_id
        AND a.email = auth.email()
    )
  );
CREATE POLICY "reservation_addons admin insert" ON public.reservation_addons FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "reservation_addons admin update" ON public.reservation_addons FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "reservation_addons admin delete" ON public.reservation_addons FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_reservation_addons_updated_at BEFORE UPDATE ON public.reservation_addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.recalculate_reservation_amount_total(p_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_id uuid;
  v_base numeric := 0;
  v_addons_total numeric := 0;
  v_paid numeric := 0;
  v_condoned numeric := 0;
  v_new_total numeric;
BEGIN
  SELECT er.event_id, COALESCE(e.price, 0)
    INTO v_event_id, v_base
  FROM public.event_reservations er
  JOIN public.events e ON e.id = er.event_id
  WHERE er.id = p_reservation_id;
  IF v_event_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_addons_total
  FROM public.reservation_addons WHERE reservation_id = p_reservation_id;

  v_new_total := v_base + v_addons_total;

  SELECT COALESCE(amount_paid, 0) INTO v_paid
  FROM public.event_reservations WHERE id = p_reservation_id;

  SELECT COALESCE(SUM(condoned_amount), 0) INTO v_condoned
  FROM public.reservation_installments WHERE reservation_id = p_reservation_id;

  UPDATE public.event_reservations
  SET amount_total = v_new_total,
      balance_due = GREATEST(v_new_total - v_paid - v_condoned, 0),
      updated_at = now()
  WHERE id = p_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_reservation_addons_recalc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_reservation_amount_total(OLD.reservation_id);
    RETURN OLD;
  ELSE
    NEW.subtotal := COALESCE(NEW.precio_unitario, 0) * COALESCE(NEW.cantidad, 0);
    PERFORM public.recalculate_reservation_amount_total(NEW.reservation_id);
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_reservation_addons_before_iu
  BEFORE INSERT OR UPDATE ON public.reservation_addons
  FOR EACH ROW EXECUTE FUNCTION public.trg_reservation_addons_recalc();

CREATE TRIGGER trg_reservation_addons_after_d
  AFTER DELETE ON public.reservation_addons
  FOR EACH ROW EXECUTE FUNCTION public.trg_reservation_addons_recalc();

UPDATE public.events
SET payment_mode = 'simple'
WHERE lower(coalesce(title, '')) LIKE '%girona%';