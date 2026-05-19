
-- Split trigger: BEFORE for subtotal, AFTER for recalc (so new row is visible in SUM)
CREATE OR REPLACE FUNCTION public.trg_reservation_addons_subtotal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.subtotal := COALESCE(NEW.precio_unitario, 0) * COALESCE(NEW.cantidad, 0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_reservation_addons_recalc_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_reservation_amount_total(OLD.reservation_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalculate_reservation_amount_total(NEW.reservation_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservation_addons_before_iu ON public.reservation_addons;
DROP TRIGGER IF EXISTS trg_reservation_addons_after_d ON public.reservation_addons;

CREATE TRIGGER trg_reservation_addons_before_iu
  BEFORE INSERT OR UPDATE ON public.reservation_addons
  FOR EACH ROW EXECUTE FUNCTION public.trg_reservation_addons_subtotal();

CREATE TRIGGER trg_reservation_addons_after_iud
  AFTER INSERT OR UPDATE OR DELETE ON public.reservation_addons
  FOR EACH ROW EXECUTE FUNCTION public.trg_reservation_addons_recalc_after();

-- Backfill any existing reservations with addons that weren't summed correctly
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT reservation_id FROM public.reservation_addons LOOP
    PERFORM public.recalculate_reservation_amount_total(r.reservation_id);
  END LOOP;
END $$;
