REVOKE EXECUTE ON FUNCTION public.buscar_alumnos_mp(text, int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_mp_preapproval_mapping(text, text, boolean, uuid, uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.buscar_alumnos_mp(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_mp_preapproval_mapping(text, text, boolean, uuid, uuid, text) TO authenticated;