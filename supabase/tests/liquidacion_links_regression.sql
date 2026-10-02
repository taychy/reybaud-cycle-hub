-- ============================================================
-- Reybaud · Regresión de links/envíos de liquidación
-- Crea datos de prueba y REVIERTE todo (termina con RAISE EXCEPTION).
-- Cobertura: token inválido, token vencido, valor de honorario resuelto
-- en servidor, doble envío bloqueado, aislamiento por coach,
-- idempotencia de recordatorios.
-- ============================================================
DO $$
DECLARE
  v_c1 uuid; v_c2 uuid; v_hon uuid; v_tok uuid; v_tok2 uuid; v_ctx jsonb; v_n int;
  v_mes text := to_char((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM');
  v_fecha date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_out text := '';
BEGIN
  -- Usa dos profesores existentes; todo se revierte al final.
  SELECT id INTO v_c1 FROM public.coaches ORDER BY created_at LIMIT 1;
  SELECT id INTO v_c2 FROM public.coaches WHERE id <> v_c1 ORDER BY created_at LIMIT 1;
  INSERT INTO public.honorarios (nombre_concepto, categoria, valor) VALUES ('Planillas ZZ test', 'otro', 27500) RETURNING id INTO v_hon;
  INSERT INTO public.movimientos_liquidacion (coach_id, fecha, tipo_actividad, origen, total, estado_economico)
  VALUES (v_c2, v_fecha, 'grupal_1h30', 'agenda_admin', 22500, 'liquidable');

  -- T1 token inválido
  IF public.get_liquidacion_by_token(gen_random_uuid())->>'error' <> 'invalid' THEN RAISE EXCEPTION 'T1 FAIL'; END IF;
  v_out := v_out || E'\nT1 PASS token inválido';

  -- T2 reutiliza token y aislamiento por coach
  v_tok := public._liq_link_get_or_create(v_c1, v_mes);
  v_tok2 := public._liq_link_get_or_create(v_c1, v_mes);
  IF v_tok <> v_tok2 THEN RAISE EXCEPTION 'T2 FAIL: token no reutilizado'; END IF;
  v_ctx := public.get_liquidacion_by_token(v_tok);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_ctx->'movimientos') e
             JOIN public.movimientos_liquidacion m ON m.id = (e->>'id')::uuid WHERE m.coach_id <> v_c1)
     OR v_ctx->>'coach_nombre' IS DISTINCT FROM (SELECT nombre FROM public.coaches WHERE id = v_c1) THEN
    RAISE EXCEPTION 'T2 FAIL: contexto filtra otro coach %', v_ctx->'movimientos';
  END IF;
  v_out := v_out || E'\nT2 PASS token reutilizado + aislamiento';

  -- T3 valor de honorario resuelto en servidor (se ignora valor_base del cliente)
  PERFORM public.submit_liquidacion_by_token(v_tok, jsonb_build_array(
    jsonb_build_object('fecha', v_fecha, 'honorario_id', v_hon, 'valor_base', 999999, 'viaticos', 6000, 'estacionamiento', 1500)), NULL);
  SELECT count(*) INTO v_n FROM public.movimientos_liquidacion
   WHERE coach_id = v_c1 AND observaciones LIKE 'Carga por link%' AND valor_base = 27500 AND total = 35000 AND tipo_actividad = 'planilla'
     AND estado_economico = 'pendiente_revision' AND origen = 'carga_coach';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T3 FAIL: valor no resuelto en servidor'; END IF;
  v_out := v_out || E'\nT3 PASS honorario server-side';

  -- T4 doble envío
  BEGIN
    PERFORM public.submit_liquidacion_by_token(v_tok, '[]'::jsonb, NULL);
    RAISE EXCEPTION 'T4 FAIL: permitió doble envío';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'T4 FAIL%' THEN RAISE; END IF;
  END;
  v_out := v_out || E'\nT4 PASS doble envío bloqueado';

  -- T5 token vencido
  v_tok2 := public._liq_link_get_or_create(v_c2, v_mes);
  UPDATE public.liquidacion_links SET expires_at = now() - interval '1 minute' WHERE token = v_tok2;
  IF public.get_liquidacion_by_token(v_tok2)->>'error' <> 'expired' THEN RAISE EXCEPTION 'T5 FAIL'; END IF;
  BEGIN
    PERFORM public.submit_liquidacion_by_token(v_tok2, '[]'::jsonb, NULL);
    RAISE EXCEPTION 'T5 FAIL: aceptó token vencido';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'T5 FAIL%' THEN RAISE; END IF;
  END;
  v_out := v_out || E'\nT5 PASS token vencido';

  -- T6 idempotencia de recordatorio
  INSERT INTO public.liquidacion_reminder_log (coach_id, mes, tipo, email) VALUES (v_c1, v_mes, 'pre_cierre', 'zz@example.invalid');
  BEGIN
    INSERT INTO public.liquidacion_reminder_log (coach_id, mes, tipo, email) VALUES (v_c1, v_mes, 'pre_cierre', 'zz@example.invalid');
    RAISE EXCEPTION 'T6 FAIL: recordatorio duplicado';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  v_out := v_out || E'\nT6 PASS idempotencia recordatorio';

  RAISE EXCEPTION 'LIQ_LINK_TESTS_DONE %', v_out;
END $$;
