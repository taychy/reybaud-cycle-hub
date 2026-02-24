CREATE OR REPLACE FUNCTION public.publish_month(p_mes text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE entrenamientos
  SET visible = true
  WHERE fecha >= (p_mes || '-01')::date
    AND fecha <= (p_mes || '-31')::date;
  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE plan_mensual
  SET estado = 'publicado'
  WHERE mes = p_mes;

  RETURN affected;
END;
$$;