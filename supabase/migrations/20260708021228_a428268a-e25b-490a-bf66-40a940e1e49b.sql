
CREATE OR REPLACE FUNCTION public.get_event_pnl(p_event_id uuid)
RETURNS TABLE (
  ingresos_brutos numeric,
  comision_mp_total numeric,
  ingresos_netos numeric,
  gastos_directos numeric,
  honorarios_coaches numeric,
  resultado numeric,
  moneda text,
  pagos_count integer,
  pagos_sin_fees integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(currency, 'ARS') INTO v_currency FROM public.events WHERE id = p_event_id;

  RETURN QUERY
  WITH ingresos AS (
    SELECT
      COALESCE(SUM(bruto), 0) AS bruto,
      COALESCE(SUM(comision_total), 0) AS comision,
      COALESCE(SUM(neto), 0) AS neto,
      COUNT(*)::int AS n,
      SUM(CASE WHEN fees_synced_at IS NULL AND metodo = 'mercadopago' THEN 1 ELSE 0 END)::int AS sin_fees
    FROM public.v_ingresos_netos
    WHERE event_id = p_event_id
  ),
  gastos AS (
    SELECT COALESCE(SUM(monto), 0) AS total
    FROM public.gastos
    WHERE event_id = p_event_id
  ),
  honorarios AS (
    SELECT COALESCE(SUM(ml.total), 0) AS total
    FROM public.movimientos_liquidacion ml
    WHERE ml.evento = (SELECT title FROM public.events WHERE id = p_event_id)
      AND ml.evento IS NOT NULL
  )
  SELECT
    i.bruto,
    i.comision,
    i.neto,
    g.total,
    h.total,
    i.neto - g.total - h.total,
    v_currency,
    i.n,
    COALESCE(i.sin_fees, 0)
  FROM ingresos i, gastos g, honorarios h;
END;
$$;

REVOKE ALL ON FUNCTION public.get_event_pnl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_pnl(uuid) TO authenticated;
