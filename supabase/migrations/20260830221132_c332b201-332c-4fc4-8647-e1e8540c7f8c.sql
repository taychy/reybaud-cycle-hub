REVOKE ALL ON FUNCTION public.generar_movimiento_turnera() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aplicar_regla_liquidacion(text,text,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirmar_clase_grupal(uuid,date,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.marcar_reserva_turnera_realizada(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cargar_clase_manual_coach(date,text,uuid,text,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.preparar_liquidacion_mensual(uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.pay_liquidacion_coach(uuid,uuid,text,numeric,text) FROM anon;
REVOKE ALL ON FUNCTION public.get_liquidaciones_alertas() FROM anon;