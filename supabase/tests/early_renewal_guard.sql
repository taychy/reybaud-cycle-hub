-- ============================================================
-- Reybaud · Test del guard EARLY_RENEWAL_PERIODO_STALE
-- ============================================================
-- Corre dentro de una transacción con ROLLBACK: no deja datos.
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/early_renewal_guard.sql
--
-- Cobertura:
--   1 INSERT con marcador EARLY_RENEWAL_FROM y fecha_inicio de un mes pasado → RECHAZADO
--   2 INSERT con marcador y fecha_inicio del mes en curso → PERMITIDO
--   3 INSERT SIN marcador y fecha_inicio de un mes pasado → PERMITIDO (carga histórica admin)
-- ============================================================

\echo '================ TEST GUARD EARLY RENEWAL ================'
BEGIN;

DO $$
DECLARE
  v_alumno uuid;
  v_plan uuid;
  v_mes_actual date := date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date;
  v_mes_pasado date := (date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')) - interval '1 month')::date;
  v_ok boolean;
BEGIN
  SELECT id INTO v_alumno FROM public.alumnos ORDER BY created_at LIMIT 1;
  SELECT id INTO v_plan FROM public.planes ORDER BY created_at LIMIT 1;
  IF v_alumno IS NULL OR v_plan IS NULL THEN
    RAISE NOTICE 'SKIP: no hay alumnos/planes para probar';
    RETURN;
  END IF;

  -- 1) early renewal con período pasado → debe fallar
  v_ok := false;
  BEGIN
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, fecha_inicio, fecha_fin, precio_base, precio_final, notas)
    VALUES (v_alumno, v_plan, 'pendiente', v_mes_pasado, (v_mes_pasado + interval '1 month - 1 day')::date, 1000, 1000,
            'EARLY_RENEWAL_FROM:00000000-0000-0000-0000-000000000001');
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%EARLY_RENEWAL_PERIODO_STALE%' THEN v_ok := true; END IF;
  END;
  RAISE NOTICE 'Test 1 (early renewal mes pasado rechazado): %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;

  -- 2) early renewal con período del mes en curso → debe pasar
  v_ok := false;
  BEGIN
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, fecha_inicio, fecha_fin, precio_base, precio_final, notas)
    VALUES (v_alumno, v_plan, 'pendiente', v_mes_actual, (v_mes_actual + interval '1 month - 1 day')::date, 1000, 1000,
            'EARLY_RENEWAL_FROM:00000000-0000-0000-0000-000000000001');
    v_ok := true;
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%EARLY_RENEWAL_PERIODO_STALE%' THEN v_ok := false; ELSE v_ok := true; END IF;
  END;
  RAISE NOTICE 'Test 2 (early renewal mes actual permitido por el guard): %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;

  -- 3) sin marcador y período pasado → el guard no interviene
  v_ok := true;
  BEGIN
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, fecha_inicio, fecha_fin, precio_base, precio_final, notas)
    VALUES (v_alumno, v_plan, 'vencida', v_mes_pasado, (v_mes_pasado + interval '1 month - 1 day')::date, 1000, 1000,
            'Carga histórica admin');
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%EARLY_RENEWAL_PERIODO_STALE%' THEN v_ok := false; END IF;
  END;
  RAISE NOTICE 'Test 3 (carga histórica sin marcador no bloqueada): %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
END $$;

ROLLBACK;
