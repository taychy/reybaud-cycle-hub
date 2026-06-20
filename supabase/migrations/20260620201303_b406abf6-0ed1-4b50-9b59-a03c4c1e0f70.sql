-- ENUMS
DO $$ BEGIN CREATE TYPE public.payment_plan_sena_tipo AS ENUM ('monto_fijo', 'porcentaje_paquete'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_plan_monto_tipo AS ENUM ('fijo', 'porcentaje_saldo'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_plan_regla_tardia AS ENUM ('cobrar_al_reservar', 'reprogramar_a_hoy', 'mantener_fechas_fijas'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.installment_type_enum AS ENUM ('sena', 'cuota'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.installment_reminder_channel AS ENUM ('email', 'whatsapp_manual', 'admin_alert'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.installment_reminder_recipient AS ENUM ('alumno', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.installment_reminder_status AS ENUM ('pending', 'sent', 'failed', 'skipped'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.event_package_payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.event_packages(id) ON DELETE CASCADE,
  nombre text NOT NULL DEFAULT 'Plan de pagos',
  version int NOT NULL DEFAULT 1,
  archived_at timestamptz,
  sena_tipo public.payment_plan_sena_tipo NOT NULL DEFAULT 'porcentaje_paquete',
  sena_valor numeric(14,2) NOT NULL DEFAULT 20,
  sena_vence_dias int NOT NULL DEFAULT 0,
  cantidad_cuotas int NOT NULL DEFAULT 0,
  last_installment_absorbs_rounding boolean NOT NULL DEFAULT true,
  regla_reserva_tardia public.payment_plan_regla_tardia NOT NULL DEFAULT 'cobrar_al_reservar',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, version)
);
CREATE INDEX IF NOT EXISTS idx_eppp_package ON public.event_package_payment_plans(package_id) WHERE archived_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_package_payment_plans TO authenticated;
GRANT SELECT ON public.event_package_payment_plans TO anon;
GRANT ALL ON public.event_package_payment_plans TO service_role;
ALTER TABLE public.event_package_payment_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view payment plans" ON public.event_package_payment_plans FOR SELECT USING (true);
CREATE POLICY "Admins manage payment plans" ON public.event_package_payment_plans FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.event_package_payment_plan_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.event_package_payment_plans(id) ON DELETE CASCADE,
  numero int NOT NULL,
  descripcion text,
  monto_tipo public.payment_plan_monto_tipo NOT NULL DEFAULT 'porcentaje_saldo',
  monto_valor numeric(14,4) NOT NULL DEFAULT 0,
  fecha_vencimiento date,
  reminders_config jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_epppi_plan ON public.event_package_payment_plan_installments(plan_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_package_payment_plan_installments TO authenticated;
GRANT SELECT ON public.event_package_payment_plan_installments TO anon;
GRANT ALL ON public.event_package_payment_plan_installments TO service_role;
ALTER TABLE public.event_package_payment_plan_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view plan installments" ON public.event_package_payment_plan_installments FOR SELECT USING (true);
CREATE POLICY "Admins manage plan installments" ON public.event_package_payment_plan_installments FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.event_reservations
  ADD COLUMN IF NOT EXISTS payment_plan_id uuid REFERENCES public.event_package_payment_plans(id),
  ADD COLUMN IF NOT EXISTS payment_plan_name_snapshot text,
  ADD COLUMN IF NOT EXISTS payment_plan_snapshot jsonb;

ALTER TABLE public.reservation_installments
  ADD COLUMN IF NOT EXISTS installment_type public.installment_type_enum NOT NULL DEFAULT 'cuota',
  ADD COLUMN IF NOT EXISTS monto_original numeric(14,2),
  ADD COLUMN IF NOT EXISTS monto_pagado numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_pendiente numeric(14,2),
  ADD COLUMN IF NOT EXISTS due_date_original date,
  ADD COLUMN IF NOT EXISTS reprogramada_por uuid,
  ADD COLUMN IF NOT EXISTS reprogramada_at timestamptz;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS admin_alert_emails text[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE IF NOT EXISTS public.reservation_installment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_installment_id uuid NOT NULL REFERENCES public.reservation_installments(id) ON DELETE CASCADE,
  offset_days int NOT NULL,
  channel public.installment_reminder_channel NOT NULL,
  recipient_type public.installment_reminder_recipient NOT NULL,
  recipient_email text,
  status public.installment_reminder_status NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rir_installment ON public.reservation_installment_reminders(reservation_installment_id);
CREATE INDEX IF NOT EXISTS idx_rir_status ON public.reservation_installment_reminders(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_installment_reminders TO authenticated;
GRANT ALL ON public.reservation_installment_reminders TO service_role;
ALTER TABLE public.reservation_installment_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view reminders" ON public.reservation_installment_reminders FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage reminders" ON public.reservation_installment_reminders FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.app_config (key, value, description)
VALUES ('default_payment_alert_emails', '[]'::jsonb, 'Lista global de emails para alertas de cobranzas (fallback)')
ON CONFLICT (key) DO NOTHING;

DROP TRIGGER IF EXISTS trg_eppp_updated_at ON public.event_package_payment_plans;
CREATE TRIGGER trg_eppp_updated_at BEFORE UPDATE ON public.event_package_payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_epppi_updated_at ON public.event_package_payment_plan_installments;
CREATE TRIGGER trg_epppi_updated_at BEFORE UPDATE ON public.event_package_payment_plan_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();