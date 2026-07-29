CREATE TABLE IF NOT EXISTS public.admin_section_seen (
  user_id uuid NOT NULL,
  section_key text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, section_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_section_seen TO authenticated;
GRANT ALL ON public.admin_section_seen TO service_role;

ALTER TABLE public.admin_section_seen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own section seen" ON public.admin_section_seen;
CREATE POLICY "Users manage own section seen"
  ON public.admin_section_seen FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.mark_admin_section_seen(p_section_key text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.admin_section_seen (user_id, section_key, seen_at)
  SELECT auth.uid(), p_section_key, now()
  WHERE auth.uid() IS NOT NULL
  ON CONFLICT (user_id, section_key) DO UPDATE SET seen_at = now();
$$;

GRANT EXECUTE ON FUNCTION public.mark_admin_section_seen(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_admin_novedades()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_seen jsonb := '{}'::jsonb;
  v_res jsonb := '{}'::jsonb;
  FN timestamptz := '-infinity'::timestamptz;
  f_alumnos timestamptz; f_eventos timestamptz; f_ventas timestamptz;
  f_pedidos timestamptz; f_entregas timestamptz; f_cambios timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN v_res; END IF;
  IF NOT (public.has_role(v_uid,'admin'::app_role) OR public.has_role(v_uid,'deposito'::app_role)) THEN
    RETURN v_res;
  END IF;

  SELECT COALESCE(jsonb_object_agg(section_key, seen_at), '{}'::jsonb) INTO v_seen
    FROM public.admin_section_seen WHERE user_id = v_uid;

  f_alumnos  := COALESCE((v_seen->>'alumnos')::timestamptz, FN);
  f_eventos  := COALESCE((v_seen->>'eventos')::timestamptz, FN);
  f_ventas   := COALESCE((v_seen->>'tienda_ventas')::timestamptz, FN);
  f_pedidos  := COALESCE((v_seen->>'pedidos_proveedor')::timestamptz, FN);
  f_entregas := COALESCE((v_seen->>'cobros_entrega')::timestamptz, FN);
  f_cambios  := COALESCE((v_seen->>'cambios_plan')::timestamptz, FN);

  v_res := jsonb_build_object(
    'alumnos', (SELECT COUNT(*) FROM public.alumnos WHERE created_at > f_alumnos)
             + (SELECT COUNT(*) FROM public.bajas_solicitudes WHERE created_at > f_alumnos AND estado = 'pendiente'),
    'eventos', (SELECT COUNT(*) FROM public.event_reservations WHERE created_at > f_eventos),
    'tienda_ventas', (SELECT COUNT(*) FROM public.store_orders WHERE created_at > f_ventas)
                   + (SELECT COUNT(*) FROM public.store_cambios WHERE created_at > f_ventas),
    'pedidos_proveedor', (SELECT COUNT(*) FROM public.supplier_orders WHERE created_at > f_pedidos),
    'cobros_entrega', (SELECT COUNT(*) FROM public.delivery_lists WHERE created_at > f_entregas),
    'cambios_plan', (SELECT COUNT(*) FROM public.solicitudes_cambio_plan WHERE created_at > f_cambios AND estado = 'pendiente')
  );

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_admin_novedades() TO authenticated;