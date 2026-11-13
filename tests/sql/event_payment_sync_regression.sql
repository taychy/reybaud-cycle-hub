\set QUIET on
CREATE TEMP TABLE results(name text, ok boolean, detail text);
CREATE FUNCTION pg_temp.chk(n text, ok boolean, d text DEFAULT '') RETURNS void LANGUAGE sql AS $$ INSERT INTO results VALUES (n, ok, d) $$;
CREATE FUNCTION pg_temp.inst(r uuid) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(installment_number||':'||status||':'||paid_amount||'/'||coalesce(monto_pagado,-1)||'/'||balance_due||'/'||coalesce(saldo_pendiente,-1), ' ' ORDER BY installment_number) FROM reservation_installments WHERE reservation_id=r $$;
CREATE FUNCTION pg_temp.has_rpc() RETURNS boolean LANGUAGE sql AS $$ SELECT to_regprocedure('register_event_mp_payment(uuid,text,text,numeric,integer,date)') IS NOT NULL $$;

-- Recalc: anulado no cuenta
SELECT t_res('00000000-0000-0000-0000-000000000001', 1000, ARRAY[1000]);
INSERT INTO reservation_payments(reservation_id, amount, currency, status, anulado_at) VALUES ('00000000-0000-0000-0000-000000000001', 1000, 'ARS', 'validado', now());
SELECT recalculate_reservation_payment_totals('00000000-0000-0000-0000-000000000001');
SELECT pg_temp.chk('recalc_excluye_anulados', amount_paid=0 AND balance_due=1000, amount_paid::text) FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000001';

-- Recalc: destino explícito respetado y espejo sincronizado
SELECT t_res('00000000-0000-0000-0000-000000000002', 300, ARRAY[100,100,100]);
INSERT INTO reservation_payments(reservation_id, amount, currency, status, installment_id, installment_number)
SELECT '00000000-0000-0000-0000-000000000002', 100, 'ARS', 'validado', id, 2 FROM reservation_installments WHERE reservation_id='00000000-0000-0000-0000-000000000002' AND installment_number=2;
SELECT recalculate_reservation_payment_totals('00000000-0000-0000-0000-000000000002');
SELECT pg_temp.chk('recalc_destino_explicito_y_espejo', pg_temp.inst('00000000-0000-0000-0000-000000000002') = '0:pendiente:0/0/100/100 1:pendiente:0/0/100/100 2:pagada:100/100/0/0', pg_temp.inst('00000000-0000-0000-0000-000000000002'));

DO $$ BEGIN IF NOT pg_temp.has_rpc() THEN
  INSERT INTO results VALUES ('rpc_register_event_mp_payment_existe', false, 'ausente (línea base)');
END IF; END $$;

-- Las siguientes sólo corren si existe la RPC
SELECT CASE WHEN pg_temp.has_rpc() THEN 1 END AS run \gset
\if :{?run}
\if :run
-- Caso Federico: seña inst:0 + pago general cubren total
SELECT t_res('00000000-0000-0000-0000-000000000010', 1196000, ARRAY[358800, 418600, 418600]);
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000010','MP-SENA','approved',358800,0);
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000010','MP-GRAL','approved',837200,NULL);
SELECT pg_temp.chk('general_total_salda_todas', pg_temp.inst('00000000-0000-0000-0000-000000000010') = '0:pagada:358800/358800/0/0 1:pagada:418600/418600/0/0 2:pagada:418600/418600/0/0'
  AND (SELECT amount_paid=1196000 AND balance_due=0 AND payment_status='pago_validado' AND reservation_status='reserva_confirmada' FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000010'), pg_temp.inst('00000000-0000-0000-0000-000000000010'));

-- Parcial general
SELECT t_res('00000000-0000-0000-0000-000000000011', 300, ARRAY[100,100,100]);
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000011','MP-P','approved',150,NULL);
SELECT pg_temp.chk('general_parcial', pg_temp.inst('00000000-0000-0000-0000-000000000011') = '0:pagada:100/100/0/0 1:parcial:50/50/50/50 2:pendiente:0/0/100/100'
  AND (SELECT payment_status='parcial' AND reservation_status='solicitud_enviada' AND balance_due=150 FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000011'), pg_temp.inst('00000000-0000-0000-0000-000000000011'));

-- Cuota específica (inst 2) no se aplica a la 0
SELECT t_res('00000000-0000-0000-0000-000000000012', 300, ARRAY[100,100,100]);
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000012','MP-I2','approved',100,2);
SELECT pg_temp.chk('cuota_especifica', pg_temp.inst('00000000-0000-0000-0000-000000000012') = '0:pendiente:0/0/100/100 1:pendiente:0/0/100/100 2:pagada:100/100/0/0'
  AND (SELECT installment_number=2 AND installment_id IS NOT NULL FROM reservation_payments WHERE mp_payment_id='MP-I2'), pg_temp.inst('00000000-0000-0000-0000-000000000012'));

-- Duplicado: reintento no duplica ni incrementa
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000011','MP-P','approved',150,NULL)->>'action' AS dup \gset
SELECT pg_temp.chk('reintento_duplicado', :'dup'='duplicate' AND (SELECT count(*)=1 FROM reservation_payments WHERE mp_payment_id='MP-P')
  AND (SELECT amount_paid=150 FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000011'), :'dup');

-- Transición informado → aprobado
SELECT t_res('00000000-0000-0000-0000-000000000013', 200, ARRAY[200]);
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000013','MP-T','pending',200,NULL);
SELECT pg_temp.chk('pendiente_no_mueve_saldo', (SELECT amount_paid=0 AND payment_status='pago_informado' FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000013'));
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000013','MP-T','approved',200,NULL)->>'action' AS tr \gset
SELECT pg_temp.chk('informado_a_aprobado', :'tr'='transitioned' AND (SELECT count(*)=1 FROM reservation_payments WHERE mp_payment_id='MP-T' AND status='validado')
  AND pg_temp.inst('00000000-0000-0000-0000-000000000013')='0:pagada:200/200/0/0'
  AND (SELECT amount_paid=200 AND reservation_status='reserva_confirmada' FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000013'), :'tr');
-- validado no se reabre por rechazo tardío
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000013','MP-T','rejected',200,NULL)->>'action' AS fk \gset
SELECT pg_temp.chk('final_no_reabre', :'fk'='final_state_kept' AND (SELECT amount_paid=200 FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000013'), :'fk');

-- Rechazado: registra trazabilidad sin mover saldo
SELECT t_res('00000000-0000-0000-0000-000000000014', 100, ARRAY[100]);
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000014','MP-R','rejected',100,NULL);
SELECT pg_temp.chk('rechazado', (SELECT amount_paid=0 AND payment_status='pago_rechazado' FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000014') AND pg_temp.inst('00000000-0000-0000-0000-000000000014')='0:pendiente:0/0/100/100');

-- Anulado: reentrega del webhook no resucita el pago
UPDATE reservation_payments SET anulado_at=now() WHERE mp_payment_id='MP-I2';
SELECT recalculate_reservation_payment_totals('00000000-0000-0000-0000-000000000012');
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000012','MP-I2','approved',100,2)->>'action' AS an \gset
SELECT pg_temp.chk('anulado_no_resucita', :'an'='annulled_kept' AND (SELECT amount_paid=0 FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000012')
  AND pg_temp.inst('00000000-0000-0000-0000-000000000012') LIKE '%2:pendiente:0/0/100/100', :'an');

-- Misma operación en otra reserva: conflicto, sin ingreso
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000014','MP-P','approved',150,NULL)->>'action' AS cf \gset
SELECT pg_temp.chk('conflicto_otra_reserva', :'cf'='conflict_other_reservation' AND (SELECT amount_paid=0 FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000014'), :'cf');

-- FX: pago en otra moneda con equivalente cargado; sin equivalente no suma
SELECT t_res('00000000-0000-0000-0000-000000000015', 1000, ARRAY[500,500], 'EUR');
INSERT INTO reservation_payments(reservation_id, amount, currency, status, equivalent_amount_event_currency) VALUES ('00000000-0000-0000-0000-000000000015', 600000, 'ARS', 'validado', 500);
INSERT INTO reservation_payments(reservation_id, amount, currency, status) VALUES ('00000000-0000-0000-0000-000000000015', 999999, 'ARS', 'validado');
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000015','MP-FX','approved',100,NULL);
SELECT pg_temp.chk('fx_equivalencias', pg_temp.inst('00000000-0000-0000-0000-000000000015')='0:pagada:500/500/0/0 1:parcial:100/100/400/400'
  AND (SELECT amount_paid=600 FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000015'), pg_temp.inst('00000000-0000-0000-0000-000000000015'));

-- Condonada y reprogramada se preservan
SELECT t_res('00000000-0000-0000-0000-000000000016', 300, ARRAY[100,100,100]);
UPDATE reservation_installments SET condoned_amount=100 WHERE reservation_id='00000000-0000-0000-0000-000000000016' AND installment_number=0;
UPDATE reservation_installments SET status='reprogramada' WHERE reservation_id='00000000-0000-0000-0000-000000000016' AND installment_number=1;
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000016','MP-C','approved',100,NULL);
SELECT pg_temp.chk('condonada_reprogramada', pg_temp.inst('00000000-0000-0000-0000-000000000016')='0:condonada:0/0/0/0 1:reprogramada:0/0/100/100 2:pagada:100/100/0/0', pg_temp.inst('00000000-0000-0000-0000-000000000016'));

-- Pagos directos de reserva transferida: no tocan amount_paid y siguen reduciendo saldo
SELECT t_res('00000000-0000-0000-0000-000000000017', 300, ARRAY[100,100,100]);
INSERT INTO reservation_transfer_direct_payments VALUES ('00000000-0000-0000-0000-000000000017', 100, 'confirmed');
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000017','MP-D','approved',100,NULL);
SELECT pg_temp.chk('directos_transferencia', (SELECT amount_paid=100 AND balance_due=100 FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000017')
  AND pg_temp.inst('00000000-0000-0000-0000-000000000017')='0:pagada:100/100/0/0 1:pagada:0/0/0/0 2:pendiente:0/0/100/100', pg_temp.inst('00000000-0000-0000-0000-000000000017'));

-- Reserva cancelada: se registra el cobro pero no se confirma
SELECT t_res('00000000-0000-0000-0000-000000000018', 100, ARRAY[100]);
UPDATE event_reservations SET reservation_status='cancelada', cancelled_at=now() WHERE id='00000000-0000-0000-0000-000000000018';
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000018','MP-X','approved',100,NULL);
SELECT pg_temp.chk('cancelada_no_confirma', (SELECT reservation_status='cancelada' FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000018'));

-- refunded/charged_back se ignoran (sin reversa automática)
SELECT register_event_mp_payment('00000000-0000-0000-0000-000000000010','MP-GRAL','refunded',837200,NULL)->>'action' AS rf \gset
SELECT pg_temp.chk('refund_sin_reversa_automatica', :'rf'='status_ignored' AND (SELECT amount_paid=1196000 FROM event_reservations WHERE id='00000000-0000-0000-0000-000000000010'), :'rf');

-- Grants
SELECT pg_temp.chk('grants_solo_service_role', NOT has_function_privilege('authenticated','register_event_mp_payment(uuid,text,text,numeric,integer,date)','EXECUTE')
  AND NOT has_function_privilege('anon','register_event_mp_payment(uuid,text,text,numeric,integer,date)','EXECUTE')
  AND has_function_privilege('service_role','register_event_mp_payment(uuid,text,text,numeric,integer,date)','EXECUTE'));
\endif
\endif
\set QUIET off
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS r, name, detail FROM results ORDER BY ok, name;
SELECT count(*) FILTER (WHERE ok) AS pass, count(*) FILTER (WHERE NOT ok) AS fail FROM results;
