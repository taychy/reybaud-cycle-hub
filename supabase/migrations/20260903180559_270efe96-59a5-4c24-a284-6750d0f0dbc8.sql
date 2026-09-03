ALTER VIEW public.vw_posibles_pagos_profesor SET (security_invoker = on);

REVOKE EXECUTE ON FUNCTION public.match_gasto_categoria(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_gasto_categoria(uuid, uuid, boolean, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.eliminar_gasto_categoria(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.vincular_egreso_mp_coach(uuid, uuid, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_resumen_financiero_mes(date, text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.match_gasto_categoria(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_gasto_categoria(uuid, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_gasto_categoria(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_egreso_mp_coach(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_resumen_financiero_mes(date, text) TO authenticated;