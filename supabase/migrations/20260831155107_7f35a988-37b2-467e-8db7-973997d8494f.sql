REVOKE ALL ON FUNCTION public.aplicar_cambio_serie_grupal(uuid, text, date, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.solicitar_cambio_agenda(text, text, uuid, text, date, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolver_solicitud_agenda(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_cambio_serie_grupal(uuid, text, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_cambio_agenda(text, text, uuid, text, date, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_solicitud_agenda(uuid, boolean, text) TO authenticated;