
-- 1) Tipo de contacto de marketing
DO $$ BEGIN
  CREATE TYPE public.marketing_contact_type AS ENUM ('lead','ex_alumno','evento_externo','manual','importado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Tabla principal
CREATE TABLE IF NOT EXISTS public.marketing_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  nombre text,
  apellido text,
  telefono text,
  tipo public.marketing_contact_type NOT NULL DEFAULT 'manual',
  origen text,                              -- texto libre: 'form web', 'evento Bariloche', 'import 2024-03', etc.
  tags text[] NOT NULL DEFAULT '{}',
  notas text,
  opt_in_marketing boolean NOT NULL DEFAULT true,
  opt_out_at timestamptz,
  opt_out_reason text,
  last_campaign_sent_at timestamptz,
  source_alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  source_event_participant_id uuid REFERENCES public.event_external_participants(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_contacts_email_lower_unique UNIQUE (email)
);

-- Normalizar email a lowercase + trim
CREATE OR REPLACE FUNCTION public.marketing_contacts_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_marketing_contacts_normalize ON public.marketing_contacts;
CREATE TRIGGER trg_marketing_contacts_normalize
BEFORE INSERT OR UPDATE ON public.marketing_contacts
FOR EACH ROW EXECUTE FUNCTION public.marketing_contacts_normalize();

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_tipo ON public.marketing_contacts(tipo);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_optin ON public.marketing_contacts(opt_in_marketing);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_tags ON public.marketing_contacts USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_last_campaign ON public.marketing_contacts(last_campaign_sent_at);

-- 3) Permisos + RLS (sólo admins)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_contacts TO authenticated;
GRANT ALL ON public.marketing_contacts TO service_role;

ALTER TABLE public.marketing_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage marketing_contacts" ON public.marketing_contacts;
CREATE POLICY "admins manage marketing_contacts"
ON public.marketing_contacts
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) Helper para auto-sumar ex-alumnos (estado inactivo) sin duplicar
CREATE OR REPLACE FUNCTION public.sync_ex_alumnos_to_marketing()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE inserted_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'only admins';
  END IF;

  WITH ins AS (
    INSERT INTO public.marketing_contacts (email, nombre, apellido, telefono, tipo, origen, source_alumno_id, created_by)
    SELECT lower(trim(a.email)),
           a.nombre, a.apellido, a.telefono,
           'ex_alumno'::public.marketing_contact_type,
           'auto: alumno inactivo',
           a.id,
           auth.uid()
    FROM public.alumnos a
    WHERE a.estado = 'inactivo'
      AND a.email IS NOT NULL
      AND a.email <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.marketing_contacts mc
        WHERE mc.email = lower(trim(a.email))
      )
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;

  RETURN COALESCE(inserted_count, 0);
END $$;

GRANT EXECUTE ON FUNCTION public.sync_ex_alumnos_to_marketing() TO authenticated;

-- 5) Helper para auto-sumar participantes externos de eventos
CREATE OR REPLACE FUNCTION public.sync_event_externals_to_marketing()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE inserted_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'only admins';
  END IF;

  WITH ins AS (
    INSERT INTO public.marketing_contacts (email, nombre, tipo, origen, source_event_participant_id, created_by)
    SELECT DISTINCT ON (lower(trim(ep.email)))
           lower(trim(ep.email)),
           ep.nombre,
           'evento_externo'::public.marketing_contact_type,
           'auto: participante externo evento',
           ep.id,
           auth.uid()
    FROM public.event_external_participants ep
    WHERE ep.email IS NOT NULL
      AND ep.email <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.marketing_contacts mc
        WHERE mc.email = lower(trim(ep.email))
      )
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;

  RETURN COALESCE(inserted_count, 0);
END $$;

GRANT EXECUTE ON FUNCTION public.sync_event_externals_to_marketing() TO authenticated;
