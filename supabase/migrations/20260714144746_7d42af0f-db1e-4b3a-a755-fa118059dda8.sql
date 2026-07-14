
CREATE OR REPLACE FUNCTION public.get_turnera_bank_config()
RETURNS TABLE (titular text, cuit text, cbu text, alias text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT value #>> '{}' FROM public.app_config WHERE key='turnera_titular'), '') AS titular,
    COALESCE((SELECT value #>> '{}' FROM public.app_config WHERE key='turnera_cuit'), '') AS cuit,
    COALESCE((SELECT value #>> '{}' FROM public.app_config WHERE key='turnera_cbu'), '') AS cbu,
    COALESCE((SELECT value #>> '{}' FROM public.app_config WHERE key='turnera_alias'), '') AS alias;
$$;

GRANT EXECUTE ON FUNCTION public.get_turnera_bank_config() TO anon, authenticated;
