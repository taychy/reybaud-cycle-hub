-- Isolated test fixture only. It adds objects required by migration 0110 and the
-- current aggregate balance function; it never connects to the application DB.
SET check_function_bodies=off;
-- 0110 exposes a combined runner; the unrelated suites are stubbed in this fixture.
CREATE FUNCTION public.run_financial_regression_tests_core()
RETURNS TABLE(test integer,estado text,nombre text,detalle text)
LANGUAGE sql AS $$ SELECT NULL::int,NULL::text,NULL::text,NULL::text WHERE false $$;
CREATE FUNCTION public.run_imputaciones_regression_tests()
RETURNS TABLE(test integer,estado text,nombre text,detalle text)
LANGUAGE sql AS $$ SELECT NULL::int,NULL::text,NULL::text,NULL::text WHERE false $$;

CREATE OR REPLACE FUNCTION public.get_saldo_alumno(p_alumno_id uuid)
RETURNS TABLE(moneda text,total_cargos numeric,total_pagos numeric,saldo numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  RETURN QUERY
  WITH movimientos_corregidos AS (
    SELECT m.moneda,m.debe,
      CASE WHEN m.tipo='pago_suscripcion' AND m.haber=0
        AND s.metodo_pago='mercadopago' AND s.mp_status='approved'
        THEN COALESCE(s.precio_final,s.precio_base,0)
        ELSE m.haber END AS haber
    FROM public.vw_cuenta_corriente_movimientos m
    LEFT JOIN public.suscripciones s ON m.fuente_tabla='suscripciones' AND m.fuente_id=s.id
    WHERE m.alumno_id=p_alumno_id
    UNION ALL
    SELECT COALESCE(p.moneda,'ARS'),0::numeric,
      COALESCE(s.precio_final,s.precio_base,p.precio,0)::numeric
    FROM public.suscripciones s
    LEFT JOIN public.planes p ON p.id=s.plan_id
    WHERE s.alumno_id=p_alumno_id AND s.cancelada_at IS NULL
      AND s.metodo_pago='mercadopago' AND s.mp_status='approved'
      AND s.origen_registro IN ('automatico','cargado_admin')
      AND s.estado IN ('activa','pendiente_verificacion','vencida','finalizada','conciliado')
      AND NOT EXISTS (
        SELECT 1 FROM public.vw_cuenta_corriente_movimientos vm
        WHERE vm.tipo='pago_suscripcion'
          AND ((vm.fuente_tabla='suscripciones' AND vm.fuente_id=s.id)
            OR (vm.fuente_tabla='mp_account_movements'
              AND (vm.referencia_extra->>'suscripcion_id')::uuid=s.id)))
      AND NOT EXISTS (
        SELECT 1 FROM public.mp_account_movements mm
        WHERE mm.suscripcion_id=s.id AND mm.status='approved'))
  SELECT mc.moneda,COALESCE(sum(mc.debe),0)::numeric,
    COALESCE(sum(mc.haber),0)::numeric,
    (COALESCE(sum(mc.debe),0)-COALESCE(sum(mc.haber),0))::numeric
  FROM movimientos_corregidos mc GROUP BY mc.moneda ORDER BY mc.moneda;
END;
$function$;
