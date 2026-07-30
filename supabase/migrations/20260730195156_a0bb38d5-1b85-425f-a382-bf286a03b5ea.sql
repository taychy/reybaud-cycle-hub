
ALTER TABLE public.precio_historial
  ADD COLUMN IF NOT EXISTS aplicado_at timestamptz,
  ADD COLUMN IF NOT EXISTS suscripciones_actualizadas integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.apply_price_change_to_subscriptions(
  _historial_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h RECORD;
  v_desde date;
  v_count integer := 0;
BEGIN
  SELECT * INTO h FROM public.precio_historial WHERE id = _historial_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cambio de precio inexistente';
  END IF;

  IF h.aplicar_a IS DISTINCT FROM 'todos' THEN
    RETURN 0;
  END IF;

  v_desde := COALESCE(h.fecha_vigencia, h.fecha_cambio::date);
  IF v_desde > CURRENT_DATE THEN
    -- todavía no entra en vigencia; el cron lo aplicará el día correspondiente
    RETURN 0;
  END IF;

  WITH upd AS (
    UPDATE public.suscripciones s
    SET precio_base = h.precio_nuevo,
        precio_final = CASE
          WHEN s.precio_base IS NULL OR s.precio_base <= 0 THEN h.precio_nuevo
          ELSE ROUND(h.precio_nuevo * (COALESCE(s.precio_final, s.precio_base) / s.precio_base))
        END,
        updated_at = now()
    WHERE s.plan_id = h.plan_id
      AND s.estado IN ('activa', 'pendiente')
      AND s.fecha_inicio >= v_desde
      AND s.precio_base IS DISTINCT FROM h.precio_nuevo
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  UPDATE public.precio_historial
  SET aplicado_at = now(),
      suscripciones_actualizadas = v_count
  WHERE id = _historial_id;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_pending_price_changes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  total integer := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.precio_historial
    WHERE aplicar_a = 'todos'
      AND aplicado_at IS NULL
      AND COALESCE(fecha_vigencia, fecha_cambio::date) <= CURRENT_DATE
    ORDER BY fecha_cambio
  LOOP
    total := total + public.apply_price_change_to_subscriptions(r.id);
  END LOOP;
  RETURN total;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_price_change_to_subscriptions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_pending_price_changes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_price_change_to_subscriptions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pending_price_changes() TO authenticated, service_role;

SELECT cron.unschedule('apply-pending-price-changes')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'apply-pending-price-changes');

SELECT cron.schedule(
  'apply-pending-price-changes',
  '15 6 * * *',
  $$ SELECT public.apply_pending_price_changes(); $$
);
