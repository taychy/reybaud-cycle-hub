REVOKE ALL ON FUNCTION public.registrar_cambio_grupo_alumno(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_cambio_grupo_alumno(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_whatsapp_grupo_on_tarea_hecha() FROM PUBLIC, anon, authenticated;