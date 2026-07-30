
CREATE OR REPLACE FUNCTION public.restore_subscription_prices_tmp()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer := 0;
BEGIN
  PERFORM set_config('app.price_sync','on', true);
  WITH aff AS (SELECT * FROM suscripciones WHERE updated_at > now() - interval '60 minutes'),
  ph AS (SELECT plan_id, COALESCE(fecha_vigencia, fecha_cambio::date) eff, precio_nuevo FROM precio_historial WHERE precio_nuevo > 1000),
  calc AS (
    SELECT a.id, a.precio_base cur_base, a.precio_final cur_final,
      (SELECT ph.precio_nuevo FROM ph WHERE ph.plan_id = a.plan_id AND ph.eff <= a.created_at::date ORDER BY ph.eff DESC, ph.precio_nuevo DESC LIMIT 1) exp_base
    FROM aff a),
  upd AS (
    UPDATE suscripciones s
    SET precio_base = c.exp_base,
        precio_final = CASE WHEN c.cur_base IS NULL OR c.cur_base <= 0 THEN c.exp_base
                            ELSE ROUND(c.exp_base * (COALESCE(c.cur_final, c.cur_base) / c.cur_base)) END
    FROM calc c
    WHERE s.id = c.id AND c.exp_base IS NOT NULL AND c.exp_base IS DISTINCT FROM c.cur_base
    RETURNING 1)
  SELECT count(*) INTO v_count FROM upd;
  PERFORM set_config('app.price_sync','off', true);

  UPDATE precio_historial SET aplicado_at = NULL, suscripciones_actualizadas = 0
  WHERE fecha_cambio < '2026-07-01' AND aplicado_at IS NOT NULL;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_subscription_prices_tmp() TO authenticated;

-- El aumento debe aplicarse a las suscripciones futuras aunque la vigencia sea posterior a hoy
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

  -- Solo alcanza a suscripciones que empiezan a partir de la vigencia (nunca a períodos ya cursados)
  v_desde := GREATEST(COALESCE(h.fecha_vigencia, h.fecha_cambio::date), h.fecha_cambio::date);

  PERFORM set_config('app.price_sync', 'on', true);

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

  PERFORM set_config('app.price_sync', 'off', true);

  UPDATE public.precio_historial
  SET aplicado_at = now(),
      suscripciones_actualizadas = v_count
  WHERE id = _historial_id;

  RETURN v_count;
END;
$$;

-- Solo aplica cambios recientes (evita reprocesar histórico antiguo)
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
      AND fecha_cambio >= now() - interval '90 days'
    ORDER BY fecha_cambio
  LOOP
    total := total + public.apply_price_change_to_subscriptions(r.id);
  END LOOP;
  RETURN total;
END;
$$;
