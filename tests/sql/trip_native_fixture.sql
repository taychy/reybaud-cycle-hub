-- Extend the existing disposable capacity fixture with native schema dependencies.
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
ALTER TABLE public.events ADD COLUMN type text DEFAULT 'camp',ADD COLUMN metadata jsonb DEFAULT '{}',ADD COLUMN currency text DEFAULT 'ARS',ADD COLUMN title text DEFAULT 'Camp QA',ADD COLUMN date date DEFAULT '2027-01-18',ADD COLUMN end_date date DEFAULT '2027-01-24';
ALTER TABLE public.event_packages ADD COLUMN precio numeric DEFAULT 1950000,ADD COLUMN currency text DEFAULT 'ARS',ADD COLUMN activo boolean DEFAULT false;
ALTER TABLE public.event_enrollment_requests ADD COLUMN currency text DEFAULT 'ARS',ADD COLUMN extra_night_interest boolean DEFAULT false;
CREATE TYPE public.installment_type_enum AS ENUM ('sena','cuota');
CREATE TABLE public.event_package_payment_plans(id uuid PRIMARY KEY,package_id uuid,nombre text,version integer DEFAULT 1,archived_at timestamptz,sena_tipo text,sena_valor numeric,sena_vence_dias integer,cantidad_cuotas integer,last_installment_absorbs_rounding boolean,regla_reserva_tardia text,activo boolean);
CREATE TABLE public.event_package_payment_plan_installments(id uuid DEFAULT gen_random_uuid(),plan_id uuid,numero integer,descripcion text,monto_tipo text,monto_valor numeric,fecha_vencimiento date,reminders_config jsonb);
CREATE TABLE public.alumnos(id uuid PRIMARY KEY,nombre text,apellido text,email text);
CREATE TABLE public.event_external_participants(id uuid PRIMARY KEY,nombre text,apellido text,email text);
ALTER TABLE public.event_reservations
 ADD COLUMN alumno_id uuid REFERENCES public.alumnos(id),ADD COLUMN external_participant_id uuid REFERENCES public.event_external_participants(id),ADD COLUMN external_email text,ADD COLUMN external_first_name text,ADD COLUMN external_last_name text,
 ADD COLUMN package_id uuid,ADD COLUMN package_nombre_snapshot text,ADD COLUMN reservation_status text DEFAULT 'solicitud_enviada',ADD COLUMN payment_status text DEFAULT 'no_informado',ADD COLUMN estado text,ADD COLUMN metodo_pago text,
 ADD COLUMN amount_total numeric,ADD COLUMN amount_paid numeric DEFAULT 0,ADD COLUMN balance_due numeric,ADD COLUMN price_snapshot numeric,ADD COLUMN currency_snapshot text,ADD COLUMN moneda text,ADD COLUMN monto numeric,
 ADD COLUMN payment_plan_id uuid,ADD COLUMN payment_plan_name_snapshot text,ADD COLUMN payment_plan_snapshot jsonb,ADD COLUMN created_by text,
 ADD COLUMN accepted_terms boolean DEFAULT false,ADD COLUMN terminos_pendientes boolean DEFAULT false,ADD COLUMN terminos_token text,ADD COLUMN terminos_token_expires_at timestamptz,
 ADD COLUMN terminos_aceptados_at timestamptz,ADD COLUMN terminos_version_aceptada text,ADD COLUMN terminos_snapshot jsonb,ADD COLUMN updated_at timestamptz,ADD COLUMN confirmed_at timestamptz,ADD COLUMN cancelled_at timestamptz;
CREATE TABLE public.event_installments(id uuid,event_id uuid,number integer,label text,amount numeric,currency text,due_date date,sort_order integer,active boolean);
CREATE TABLE public.reservation_installments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reservation_id uuid REFERENCES public.event_reservations(id),event_installment_id uuid,installment_number integer,label text,amount numeric,currency text,due_date date,sort_order integer,status text,paid_amount numeric,balance_due numeric,installment_type public.installment_type_enum,monto_original numeric,monto_pagado numeric,saldo_pendiente numeric,due_date_original date,original_due_date date,notas text,condoned_amount numeric DEFAULT 0,updated_at timestamptz,UNIQUE(reservation_id,installment_number));
CREATE TABLE public.reservation_payments(id uuid DEFAULT gen_random_uuid(),reservation_id uuid REFERENCES public.event_reservations(id),status text,anulado_at timestamptz,amount numeric,currency text,equivalent_amount_event_currency numeric,mp_explicit_installment boolean DEFAULT false,installment_id uuid);
CREATE TABLE public.reservation_status_history(reservation_id uuid,old_reservation_status text,new_reservation_status text,old_payment_status text,new_payment_status text,changed_by uuid,changed_by_role text,note text);
ALTER TABLE public.event_reservations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.event_reservations TO anon,authenticated;
-- No public reservation policy: a token exposes terms only.
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
CREATE FUNCTION public.qa_native_request(i integer,p uuid,n integer) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE rid uuid; arr jsonb:='[]';j integer;
BEGIN
 rid:=public.qa_request(i,p,n);
 FOR j IN 1..n LOOP
 INSERT INTO public.event_external_participants VALUES(md5('person:'||i||':'||j)::uuid,'Persona'||i,'QA'||j,'persona'||i||'-'||j||'@example.invalid');
 arr:=arr||jsonb_build_array(jsonb_build_object('firstName','Persona'||i,'lastName','QA'||j));
 END LOOP;
 UPDATE public.event_enrollment_requests SET attendees=arr WHERE id=rid;
 RETURN rid;
END $$;
CREATE FUNCTION public.qa_emails(i integer,n integer) RETURNS text[] LANGUAGE sql AS $$ SELECT array_agg('persona'||i||'-'||j||'@example.invalid' ORDER BY j) FROM generate_series(1,n) j $$;
