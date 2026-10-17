BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.event_choice_survey_admin_entries) THEN RAISE EXCEPTION 'Non-admin can read sizes'; END IF;
 IF EXISTS(SELECT 1 FROM public.event_choice_survey_admin_log) THEN RAISE EXCEPTION 'Non-admin can read logs'; END IF;
 BEGIN
  INSERT INTO public.event_choice_survey_admin_entries(reservation_id,survey_key,status,confirmed_value) VALUES('eb9070ef-ca35-49c8-92eb-8381263dcbd0','talle_camiseta','confirmed','L');
  RAISE EXCEPTION 'Non-admin write accepted';
 EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
  IF SQLERRM NOT LIKE '%Solo administración%' AND SQLSTATE <> '42501' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DO $$
BEGIN
 BEGIN
  UPDATE public.event_choice_survey_admin_entries SET status='confirmed',confirmed_value='no_seguro',candidates='{}' WHERE reservation_id='d5178382-3e50-48dc-a320-0c9fcdf58296' AND survey_key='talle_camiseta';
  RAISE EXCEPTION 'Uncertain option accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Talle confirmado inválido' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.event_choice_survey_admin_entries SET candidates=ARRAY['XXXL'] WHERE reservation_id='d5178382-3e50-48dc-a320-0c9fcdf58296' AND survey_key='talle_camiseta';
  RAISE EXCEPTION 'Invalid candidate accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Alternativa inválida' THEN RAISE; END IF; END;
END $$;
ROLLBACK;