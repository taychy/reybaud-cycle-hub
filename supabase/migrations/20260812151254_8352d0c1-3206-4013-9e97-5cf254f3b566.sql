DO $do$
DECLARE v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'run_programa_bajas_tests';
  v_src := replace(v_src, 'SET estado = ''fusionada'' WHERE id = v_a2', 'SET estado = ''inactivo'' WHERE id = v_a2');
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.run_programa_bajas_tests() RETURNS TABLE(test integer, estado text, nombre text, detalle text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_src);
END $do$;