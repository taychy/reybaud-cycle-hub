-- Rollback candidate for 0111: restores the previous manual-subscription haber.
-- The helper is intentionally retained and deprecated; no destructive DROP is needed.
DO $view$
DECLARE
  d text;
  needle text := $old$ELSE suscripcion_haber_manual_cc(s.id, COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric))
        END AS haber,$old$;
  replacement text := $new$ELSE COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric)
        END AS haber,$new$;
BEGIN
  d:=pg_get_viewdef('public.vw_cuenta_corriente_movimientos'::regclass,true);
  IF strpos(d,needle)=0 THEN
    RAISE EXCEPTION 'vw_cuenta_corriente_movimientos: corrected branch not found; rollback aborted';
  END IF;
  d:=replace(d,needle,replacement);
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos WITH(security_invoker=true) AS '||d;
END
$view$;
COMMENT ON FUNCTION public.suscripcion_haber_manual_cc(uuid,numeric) IS
  'DEPRECATED: rollback 0111 restauró el haber manual anterior; función sin uso, conservada para rollback no destructivo.';
