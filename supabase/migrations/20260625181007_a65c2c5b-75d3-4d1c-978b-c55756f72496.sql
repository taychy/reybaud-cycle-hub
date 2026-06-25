
-- Restrict column-level SELECT on sensitive columns: admins can still insert/update them,
-- but cannot read them back from the client. Only service_role (edge functions) can read.

-- cuentas_mp: hide secret_name_* from authenticated/anon reads
REVOKE SELECT ON public.cuentas_mp FROM authenticated;
REVOKE SELECT ON public.cuentas_mp FROM anon;
GRANT SELECT (
  id, nombre, slug, emisor_fiscal_default_id, modo, activa,
  es_default_global, limite_mensual_ars, notas,
  created_at, updated_at, tiene_secrets
) ON public.cuentas_mp TO authenticated;

-- emisores_fiscales: hide cert_pem and key_pem from authenticated/anon reads
REVOKE SELECT ON public.emisores_fiscales FROM authenticated;
REVOKE SELECT ON public.emisores_fiscales FROM anon;
GRANT SELECT (
  id, nombre_fiscal, cuit, punto_venta, activo,
  es_predeterminado, facturacion_automatica, limite_anual_ars,
  categoria_monotributo, auto_facturar_origenes, logo_url,
  domicilio_comercial, condicion_iva, inicio_actividades,
  email_contacto, telefono_contacto, website, ingresos_brutos,
  tiene_credenciales, created_at, updated_at
) ON public.emisores_fiscales TO authenticated;
