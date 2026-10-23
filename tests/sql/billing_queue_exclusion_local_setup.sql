-- Minimal isolated PostgreSQL fixture. NEVER run against the application database.
CREATE SCHEMA auth;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TYPE public.app_role AS ENUM ('admin','alumno','coach','deposito');
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
INSERT INTO public.user_roles VALUES('00000000-0000-0000-0000-000000000001','admin');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) $$;
CREATE FUNCTION public.is_super_admin(u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public._fact_segmento_norm(s text) RETURNS text LANGUAGE sql AS $$ SELECT s $$;
CREATE TABLE public.facturacion_cola(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL, pago_id text NOT NULL,
  referencia_tipo text NOT NULL, referencia_id uuid NOT NULL, concepto text NOT NULL,
  monto numeric NOT NULL, moneda text DEFAULT 'ARS', pagado_at timestamptz NOT NULL,
  periodo_pago date NOT NULL, periodo_operativo date NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente', auto_estado text NOT NULL DEFAULT 'manual',
  factura_id uuid, auto_lock_at timestamptz, auto_reevaluar_at timestamptz,
  auto_intentos integer DEFAULT 0, auto_proximo_intento_at timestamptz,
  auto_ultimo_error text, auto_ultimo_intento_at timestamptz,
  ingreso text DEFAULT 'rebuild', created_at timestamptz DEFAULT now(),
  emisor_resuelto_id uuid, segmento text,
  UNIQUE(referencia_tipo,referencia_id,pago_id)
);
CREATE TABLE public.facturas(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cliente_nombre text, concepto text, monto numeric,
  moneda text DEFAULT 'ARS', referencia_tipo text, referencia_id uuid, facturacion_cola_id uuid,
  estado text DEFAULT 'sin_factura', cae text, recuperacion_estado text
);
CREATE TABLE public.emisores_fiscales(id uuid PRIMARY KEY, activo boolean, facturacion_automatica boolean, facturacion_automatica_desde timestamptz);
CREATE TABLE public.emisor_segmento_config(emisor_id uuid,segmento text,habilitado boolean,auto_habilitado boolean,auto_desde timestamptz);
CREATE FUNCTION public.reevaluar_facturacion_cola(p_ids uuid[]) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  UPDATE public.facturacion_cola SET auto_reevaluar_at=now(),auto_intentos=0,auto_proximo_intento_at=NULL
    WHERE id=ANY(p_ids) AND estado='pendiente' AND auto_estado NOT IN ('emitiendo','facturada');
  GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;