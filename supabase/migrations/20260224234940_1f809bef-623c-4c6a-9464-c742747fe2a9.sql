CREATE OR REPLACE FUNCTION public.publish_month(p_mes text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected integer;
  start_date date;
  end_date date;
BEGIN
  start_date := (p_mes || '-01')::date;
  end_date := (start_date + interval '1 month' - interval '1 day')::date;

  UPDATE entrenamientos
  SET visible = true
  WHERE fecha >= start_date
    AND fecha <= end_date;
  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE plan_mensual
  SET estado = 'publicado'
  WHERE mes = p_mes;

  RETURN affected;
END;
$$;