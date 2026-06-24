BEGIN;
SET LOCAL session_replication_role = 'replica';

-- Paso 1: Snapshot
CREATE TABLE IF NOT EXISTS public._audit_suscripciones_20260624 (
  id uuid,
  mp_status text,
  mp_payment_id text,
  precio_base numeric,
  precio_final numeric,
  notas text,
  snapshot_at timestamptz
);

INSERT INTO public._audit_suscripciones_20260624
SELECT id, mp_status, mp_payment_id, precio_base, precio_final, notas, now()
FROM public.suscripciones
WHERE (id::text LIKE 'c50e54a4%' OR id::text LIKE '1dab2393%')
   OR (mp_payment_id IS NULL AND mp_status IN (
        'efectivo','transferencia','tarjeta','mercadopago',
        'mp_externo','mp_externo_josi','mp_externo_scarlett','mp_externo_claudio',
        'plataforma_externa','otro'
      ));

-- Paso 2: Backfill precios Daniel
UPDATE public.suscripciones
SET precio_base = 75500,
    precio_final = COALESCE(precio_final, 75500),
    notas = COALESCE(notas,'') || E'\n[AUDIT 2026-06-24] Backfill precio_base=75500 desde precio_historial (Pase Libre vigente).'
WHERE (id::text LIKE 'c50e54a4%' OR id::text LIKE '1dab2393%')
  AND precio_base IS NULL;

-- Paso 3: Sweep mp_status
UPDATE public.suscripciones
SET mp_status = NULL,
    notas = COALESCE(notas,'') || E'\n[AUDIT 2026-06-24] mp_status nulificado (sin mp_payment_id real).'
WHERE mp_payment_id IS NULL
  AND mp_status IN (
    'efectivo','transferencia','tarjeta','mercadopago',
    'mp_externo','mp_externo_josi','mp_externo_scarlett','mp_externo_claudio',
    'plataforma_externa','otro'
  );

COMMIT;