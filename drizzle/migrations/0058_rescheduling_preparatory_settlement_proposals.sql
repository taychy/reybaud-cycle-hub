CREATE TABLE public.rescheduling_settlement_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id uuid NOT NULL REFERENCES public.event_reservations(id),
 version integer NOT NULL, command_id uuid NOT NULL UNIQUE, actor_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('estimated','reconcile','validated')), source_hash text NOT NULL,
 calculated_amount numeric(14,2) NOT NULL, authorized_amount numeric(14,2),
 jersey_amount numeric(14,2) NOT NULL DEFAULT 0, checks jsonb NOT NULL, note text NOT NULL,
 command_payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(reservation_id,version)
);
GRANT SELECT ON public.rescheduling_settlement_proposals TO authenticated;
GRANT ALL ON public.rescheduling_settlement_proposals TO service_role;
ALTER TABLE public.rescheduling_settlement_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY settlement_proposals_admin ON public.rescheduling_settlement_proposals FOR SELECT TO authenticated USING(public._rescheduling_admin());

CREATE FUNCTION public._rescheduling_settlement_sources(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; result jsonb; pays jsonb; refunds jsonb; directs jsonb; transfers jsonb; adjustments jsonb; credits jsonb; imputations jsonb; req jsonb; obligations jsonb;
BEGIN
 SELECT * INTO r FROM public.event_reservations WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reserva inexistente'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') INTO pays FROM public.reservation_payments p WHERE p.reservation_id=p_id;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]') INTO refunds FROM public.devoluciones d WHERE d.reservation_id=p_id OR d.reservation_payment_id IN (SELECT id FROM public.reservation_payments WHERE reservation_id=p_id);
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]') INTO directs FROM public.reservation_transfer_direct_payments d WHERE d.original_reservation_id=p_id OR d.replacement_reservation_id=p_id;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') INTO transfers FROM public.reservation_transfers t WHERE t.original_reservation_id=p_id OR t.replacement_reservation_id=p_id;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') INTO adjustments FROM public.reservation_financial_adjustments a WHERE a.reservation_id=p_id;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') INTO credits FROM public.cuenta_ajustes a WHERE a.alumno_id=r.alumno_id OR a.aplicado_a_fuente_id=p_id;
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]') INTO imputations FROM public.pagos_imputaciones i WHERE i.obligacion_id=p_id OR i.alumno_id=r.alumno_id OR i.pago_origen_id IN (SELECT id FROM public.reservation_payments WHERE reservation_id=p_id);
 SELECT to_jsonb(q) INTO req FROM public.reservation_rescheduling_requests q WHERE q.reservation_id=p_id;
 SELECT to_jsonb(o) INTO obligations FROM public.reservation_refund_obligations o WHERE o.reservation_id=p_id;
 result:=jsonb_build_object('reservation',jsonb_build_object('id',r.id,'alumno_id',r.alumno_id,'event_id',r.event_id,'currency',coalesce(r.currency_snapshot,r.moneda),'amount_paid',r.amount_paid,'status',r.reservation_status),'payments',pays,'refunds',refunds,'directs',directs,'transfers',transfers,'adjustments',adjustments,'credits',credits,'imputations',imputations,'request',req,'obligation',obligations,'size',public._rescheduling_size(p_id),'campaign',(SELECT to_jsonb(c) FROM public.event_rescheduling_campaigns c WHERE c.event_id=r.event_id));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public._rescheduling_settlement_sources(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._rescheduling_settlement_totals(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE paid numeric:=0;returned numeric:=0;din numeric:=0;dout numeric:=0;excluded integer:=0; alerts jsonb:='[]';x jsonb;net numeric;duplicate boolean;
BEGIN
 IF p->'reservation'->>'currency' IS DISTINCT FROM 'ARS' THEN alerts:=alerts||jsonb_build_array('Moneda de reserva ambigua o distinta de ARS'); END IF;
 IF p->'reservation'->>'alumno_id' IS NULL THEN alerts:=alerts||jsonb_build_array('Reserva externa sin ficha: beneficiario pendiente de conciliación'); END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p->'payments') LOOP
 IF x->>'status'='validado' AND x->>'anulado_at' IS NULL THEN
 IF x->>'currency' IS DISTINCT FROM 'ARS' OR coalesce(x->>'event_currency','ARS')<>'ARS' OR (x->>'original_currency' IS NOT NULL AND x->>'original_currency'<>'ARS') THEN alerts:=alerts||jsonb_build_array('Pago multimoneda: no se convierte ni se autoriza automáticamente');
 ELSE
 paid:=paid+coalesce((x->>'amount')::numeric,0);
 IF coalesce((x->>'amount')::numeric,0)<=0 THEN alerts:=alerts||jsonb_build_array('Pago validado con importe inconsistente'); END IF;
 IF (x->>'obligation_amount_contract' IS NOT NULL AND (x->>'obligation_amount_contract')::numeric<>(x->>'amount')::numeric) OR (x->>'equivalent_amount_event_currency' IS NOT NULL AND (x->>'equivalent_amount_event_currency')::numeric<>(x->>'amount')::numeric) THEN alerts:=alerts||jsonb_build_array('Importe contractual distinto del recibo'); END IF;
 END IF;
 ELSE excluded:=excluded+1; END IF;
 END LOOP;
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'payments') a WHERE a->>'status'='validado' AND a->>'anulado_at' IS NULL AND nullif(a->>'mp_payment_id','') IS NOT NULL GROUP BY a->>'mp_payment_id' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'payments') a WHERE a->>'status'='validado' AND a->>'anulado_at' IS NULL AND nullif(a->>'payment_reference','') IS NOT NULL GROUP BY a->>'payment_reference' HAVING count(*)>1) INTO duplicate;
 IF duplicate THEN alerts:=alerts||jsonb_build_array('Recibos con referencia duplicada: no sumar sin conciliación'); END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p->'refunds') LOOP
 IF x->>'moneda'='ARS' THEN returned:=returned+coalesce((x->>'monto')::numeric,0); IF coalesce((x->>'monto')::numeric,0)<=0 THEN alerts:=alerts||jsonb_build_array('Reintegro inconsistente'); END IF;
 ELSE alerts:=alerts||jsonb_build_array('Reintegro con moneda ambigua'); END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(p->'directs') LOOP
 IF x->>'status'='confirmed' AND x->>'voided_at' IS NULL THEN
 IF x->>'currency'='ARS' THEN
 IF x->>'replacement_reservation_id'=p->'reservation'->>'id' THEN din:=din+coalesce((x->>'amount')::numeric,0); END IF;
 IF x->>'original_reservation_id'=p->'reservation'->>'id' THEN dout:=dout+coalesce((x->>'amount')::numeric,0); END IF;
 ELSE alerts:=alerts||jsonb_build_array('Pago directo multimoneda'); END IF;
 END IF;
 END LOOP;
 IF jsonb_array_length(p->'transfers')>0 OR jsonb_array_length(p->'directs')>0 THEN alerts:=alerts||jsonb_build_array('Transferencias o pagos entre participantes: caja Reybaud separada, beneficiario a conciliar'); END IF;
 IF jsonb_array_length(p->'credits')>0 OR jsonb_array_length(p->'adjustments')>0 OR jsonb_array_length(p->'imputations')>0 THEN alerts:=alerts||jsonb_build_array('Ajustes, créditos o imputaciones existentes: revisar aplicación y evitar doble devolución'); END IF;
 IF returned>paid OR coalesce((p->'obligation'->>'monto_devuelto')::numeric,0)>returned THEN alerts:=alerts||jsonb_build_array('Reintegros no conciliados con recibos u obligación'); END IF;
 IF p->'reservation'->>'status' IN ('cancelada','rechazada','cancelled','cancelado') THEN alerts:=alerts||jsonb_build_array('Reserva no vigente: requiere revisión'); END IF;
 net:=greatest(paid-returned,0);
 RETURN jsonb_build_object('paid_ars',paid,'returned_ars',returned,'direct_paid_ars',din,'direct_received_ars',dout,'net_ars',net,'excluded_count',excluded,'alerts',alerts,'blocked',jsonb_array_length(alerts)>0,'confirmed_net_ars',CASE WHEN jsonb_array_length(alerts)=0 THEN net ELSE NULL END,'credit_available_ars',0,'execution_enabled',false);
END $$;
REVOKE ALL ON FUNCTION public._rescheduling_settlement_totals(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.admin_rescheduling_settlement_preview(p_reservation_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb;t jsonb;proposal jsonb;history jsonb;hash text;BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.event_reservations r JOIN public.event_rescheduling_campaigns c ON c.event_id=r.event_id WHERE r.id=p_reservation_id) THEN RAISE EXCEPTION 'Campaña inexistente'; END IF;
 s:=public._rescheduling_settlement_sources(p_reservation_id); t:=public._rescheduling_settlement_totals(s);hash:=md5(s::text);
 SELECT to_jsonb(q)-'command_payload'-'actor_id'-'command_id' INTO proposal FROM public.rescheduling_settlement_proposals q WHERE reservation_id=p_reservation_id ORDER BY version DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('version',q.version,'state',q.state,'authorized_amount',q.authorized_amount,'jersey_amount',q.jersey_amount,'note',q.note,'created_at',q.created_at) ORDER BY version DESC),'[]') INTO history FROM public.rescheduling_settlement_proposals q WHERE reservation_id=p_reservation_id;
 RETURN jsonb_build_object('source_hash',hash,'totals',t,'request',s->'request'-'snapshot'-'actor_id'-'command_id'-'reviewed_by','proposal',proposal,'stale',proposal IS NOT NULL AND proposal->>'source_hash'<>hash,'history',history,
 'payments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','amount',x->'amount','currency',x->>'currency','method',x->>'payment_method','date',x->>'payment_date','reference',x->>'payment_reference','proof',x->>'proof_url','included',x->>'status'='validado' AND x->>'anulado_at' IS NULL AND x->>'currency'='ARS','status',x->>'status')),'[]') FROM jsonb_array_elements(s->'payments') x),
 'refunds',(SELECT coalesce(jsonb_agg(jsonb_build_object('amount',x->'monto','currency',x->>'moneda','date',x->>'fecha','method',x->>'metodo')),'[]') FROM jsonb_array_elements(s->'refunds') x),
 'directs',(SELECT coalesce(jsonb_agg(jsonb_build_object('amount',x->'amount','currency',x->>'currency','status',x->>'status','voided',x->>'voided_at' IS NOT NULL,'proof',x->>'proof_path','direction',CASE WHEN x->>'original_reservation_id'=p_reservation_id::text THEN 'recibido' ELSE 'efectuado' END)),'[]') FROM jsonb_array_elements(s->'directs') x),
 'existing',jsonb_build_object('adjustments',jsonb_array_length(s->'adjustments'),'credits',jsonb_array_length(s->'credits'),'imputations',jsonb_array_length(s->'imputations'),'transfers',jsonb_array_length(s->'transfers')));
END $$;
REVOKE ALL ON FUNCTION public.admin_rescheduling_settlement_preview(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_rescheduling_settlement_preview(uuid) TO authenticated;

CREATE FUNCTION public.admin_save_rescheduling_settlement(p_reservation_id uuid,p_source_hash text,p_version integer,p_command_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb;t jsonb;q record;v integer;st text:=p_input->>'state';nt text:=trim(p_input->>'note');amt numeric;jersey numeric:=0;checks jsonb:=coalesce(p_input->'checks','{}');req jsonb;payload jsonb;BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 IF p_command_id IS NULL OR p_version IS NULL OR p_source_hash IS NULL OR p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR length(p_input::text)>5000 OR st IS NULL OR st NOT IN ('estimated','reconcile','validated') OR coalesce(length(nt),0)=0 OR length(nt)>2000 THEN RAISE EXCEPTION 'Estado, motivo e identificador obligatorios'; END IF;
 PERFORM 1 FROM public.event_reservations WHERE id=p_reservation_id FOR UPDATE;
 payload:=jsonb_build_object('reservation',p_reservation_id,'hash',p_source_hash,'version',p_version,'input',p_input);
 SELECT * INTO q FROM public.rescheduling_settlement_proposals WHERE command_id=p_command_id;
 IF FOUND THEN IF q.command_payload<>payload OR q.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Identificador utilizado para otra operación'; END IF; RETURN public.admin_rescheduling_settlement_preview(p_reservation_id); END IF;
 SELECT coalesce(max(version),0) INTO v FROM public.rescheduling_settlement_proposals WHERE reservation_id=p_reservation_id;
 IF v<>p_version THEN RAISE EXCEPTION 'Otra propuesta fue guardada. Recargá'; END IF;
 s:=public._rescheduling_settlement_sources(p_reservation_id);t:=public._rescheduling_settlement_totals(s);req:=s->'request';
 IF s->'campaign' IS NULL OR s->'campaign'='null'::jsonb THEN RAISE EXCEPTION 'Campaña inexistente'; END IF;
 IF md5(s::text)<>p_source_hash THEN RAISE EXCEPTION 'Pagos o solicitud cambiaron. Recalculá'; END IF;
 IF st='validated' THEN
 IF (t->>'blocked')::boolean OR req->>'choice' IS NULL OR req->>'choice' NOT IN ('refund','credit') OR coalesce((checks->>'reconciled')::boolean,false)=false THEN RAISE EXCEPTION 'Conciliación bloqueada o decisión financiera pendiente'; END IF;
 amt:=(p_input->>'authorized_amount')::numeric;
 IF amt IS NULL OR amt<0 OR amt>(t->>'confirmed_net_ars')::numeric OR amt<>round(amt,2) THEN RAISE EXCEPTION 'Monto fuera del neto real confirmado'; END IF;
 IF coalesce((checks->>'jersey_validated')::boolean,false) THEN
 IF req->>'jersey_requested' IS DISTINCT FROM 'true' OR req->>'jersey_consent' IS DISTINCT FROM 'true' OR nullif(req->>'jersey_size','') IS NULL OR req->>'delivery' IS NULL OR coalesce((checks->>'stock')::boolean,false)=false OR coalesce((checks->>'size')::boolean,false)=false OR coalesce((checks->>'delivery')::boolean,false)=false OR amt<50000 OR (s->'size'->>'conflict')::boolean THEN RAISE EXCEPTION 'Jersey pendiente de consentimiento, stock, talle, entrega o saldo'; END IF;
 jersey:=50000;
 END IF;
 END IF;
 INSERT INTO public.rescheduling_settlement_proposals(reservation_id,version,command_id,actor_id,state,source_hash,calculated_amount,authorized_amount,jersey_amount,checks,note,command_payload) VALUES(p_reservation_id,v+1,p_command_id,auth.uid(),st,p_source_hash,(t->>'net_ars')::numeric,amt,jersey,checks,nt,payload);
 RETURN public.admin_rescheduling_settlement_preview(p_reservation_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_save_rescheduling_settlement(uuid,text,integer,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_save_rescheduling_settlement(uuid,text,integer,uuid,jsonb) TO authenticated;