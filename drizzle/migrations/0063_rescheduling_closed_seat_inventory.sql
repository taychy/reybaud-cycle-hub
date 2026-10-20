CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.event_rescheduling_campaigns ADD COLUMN IF NOT EXISTS resale_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.event_rescheduling_campaigns.resale_enabled IS 'Closed inventory: offering/occupying released seats stays blocked until explicit human authorization.';

CREATE TABLE public.rescheduling_seat_releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.event_rescheduling_campaigns(event_id),
 source_reservation_id uuid NOT NULL UNIQUE REFERENCES public.event_reservations(id),
 package_id uuid,
 kind text NOT NULL CHECK (kind IN ('refund','credit_withdrawal')),
 state text NOT NULL CHECK (state IN ('renuncia_confirmada','liberada','ofrecida','ocupada','anulada')),
 request_revision integer NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 reason text NOT NULL,
 confirmed_by uuid, confirmed_at timestamptz,
 approved_by uuid, approved_at timestamptz,
 offered_by uuid, offered_at timestamptz,
 revoked_by uuid, revoked_at timestamptz, revoke_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (state NOT IN ('liberada','ofrecida','ocupada') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
 CHECK (state NOT IN ('ofrecida','ocupada') OR offered_at IS NOT NULL)
);
GRANT SELECT ON public.rescheduling_seat_releases TO authenticated;
GRANT ALL ON public.rescheduling_seat_releases TO service_role;
ALTER TABLE public.rescheduling_seat_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY seat_releases_admin ON public.rescheduling_seat_releases FOR SELECT TO authenticated USING (public._rescheduling_admin());

CREATE TABLE public.rescheduling_seat_occupancies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 release_id uuid NOT NULL REFERENCES public.rescheduling_seat_releases(id),
 replacement_reservation_id uuid NOT NULL UNIQUE REFERENCES public.event_reservations(id),
 window_choice text NOT NULL,
 nights daterange NOT NULL,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 EXCLUDE USING gist (release_id WITH =, nights WITH &&)
);
GRANT SELECT ON public.rescheduling_seat_occupancies TO authenticated;
GRANT ALL ON public.rescheduling_seat_occupancies TO service_role;
ALTER TABLE public.rescheduling_seat_occupancies ENABLE ROW LEVEL SECURITY;
CREATE POLICY seat_occupancies_admin ON public.rescheduling_seat_occupancies FOR SELECT TO authenticated USING (public._rescheduling_admin());

CREATE TABLE public.rescheduling_seat_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 release_id uuid NOT NULL REFERENCES public.rescheduling_seat_releases(id),
 command_id uuid NOT NULL UNIQUE,
 action text NOT NULL,
 actor_id uuid NOT NULL,
 reason text NOT NULL,
 before_data jsonb,
 after_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rescheduling_seat_history TO authenticated;
GRANT ALL ON public.rescheduling_seat_history TO service_role;
ALTER TABLE public.rescheduling_seat_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY seat_history_admin ON public.rescheduling_seat_history FOR SELECT TO authenticated USING (public._rescheduling_admin());

CREATE FUNCTION public._rescheduling_seat_request_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.choice IS DISTINCT FROM OLD.choice AND EXISTS (SELECT 1 FROM public.rescheduling_seat_releases s WHERE s.source_reservation_id=NEW.reservation_id AND s.state IN ('liberada','ofrecida','ocupada')) THEN
  RAISE EXCEPTION 'La plaza ya fue liberada por administración; la elección no puede cambiarse sin revisión';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._rescheduling_seat_request_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rescheduling_seat_request_guard BEFORE UPDATE ON public.reservation_rescheduling_requests FOR EACH ROW EXECUTE FUNCTION public._rescheduling_seat_request_guard();

CREATE FUNCTION public.admin_rescheduling_seat_action(p_reservation_id uuid, p_action text, p_reason text, p_expected_version integer, p_command_id uuid, p_replacement_reservation_id uuid DEFAULT NULL, p_window text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r event_reservations%ROWTYPE; rep event_reservations%ROWTYPE; q reservation_rescheduling_requests%ROWTYPE; s rescheduling_seat_releases%ROWTYPE; old jsonb; c event_rescheduling_campaigns%ROWTYPE; opt jsonb; prior rescheduling_seat_history%ROWTYPE;
BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 IF p_command_id IS NULL OR p_expected_version IS NULL OR p_action NOT IN ('confirm_renunciation','approve_release','offer','occupy','revoke') OR length(trim(coalesce(p_reason,'')))<5 OR length(p_reason)>2000 THEN RAISE EXCEPTION 'Acción, versión y motivo obligatorios'; END IF;
 SELECT * INTO r FROM event_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Reserva inexistente'; END IF;
 SELECT * INTO c FROM event_rescheduling_campaigns WHERE event_id=r.event_id;
 IF c.event_id IS NULL THEN RAISE EXCEPTION 'Sin campaña de reprogramación'; END IF;
 SELECT * INTO prior FROM rescheduling_seat_history WHERE command_id=p_command_id;
 IF prior.id IS NOT NULL THEN
  IF prior.action<>p_action OR NOT EXISTS (SELECT 1 FROM rescheduling_seat_releases WHERE id=prior.release_id AND source_reservation_id=p_reservation_id) THEN RAISE EXCEPTION 'Identificador ya utilizado para otra operación'; END IF;
  RETURN prior.after_data;
 END IF;
 SELECT * INTO q FROM reservation_rescheduling_requests WHERE reservation_id=p_reservation_id FOR UPDATE;
 SELECT * INTO s FROM rescheduling_seat_releases WHERE source_reservation_id=p_reservation_id FOR UPDATE;
 IF coalesce(s.version,0)<>p_expected_version THEN RAISE EXCEPTION 'El cupo cambió. Recargá antes de continuar'; END IF;
 old := CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END;
 IF p_action='confirm_renunciation' THEN
  IF s.id IS NOT NULL AND s.state<>'anulada' THEN RAISE EXCEPTION 'La renuncia ya está registrada'; END IF;
  IF r.reservation_status<>'reserva_confirmada' THEN RAISE EXCEPTION 'Solo reservas vigentes de la campaña'; END IF;
  IF q.reservation_id IS NULL OR q.review_status<>'validada' OR q.choice NOT IN ('refund','credit') THEN RAISE EXCEPTION 'Requiere solicitud de devolución o crédito validada'; END IF;
  IF q.choice='credit' AND length(trim(p_reason))<20 THEN RAISE EXCEPTION 'Crédito: documentá la revisión independiente del desistimiento'; END IF;
  IF s.id IS NULL THEN
   INSERT INTO rescheduling_seat_releases(event_id,source_reservation_id,package_id,kind,state,request_revision,reason,confirmed_by,confirmed_at)
   VALUES(r.event_id,r.id,r.package_id,CASE WHEN q.choice='refund' THEN 'refund' ELSE 'credit_withdrawal' END,'renuncia_confirmada',q.revision,p_reason,auth.uid(),now()) RETURNING * INTO s;
  ELSE
   UPDATE rescheduling_seat_releases SET kind=CASE WHEN q.choice='refund' THEN 'refund' ELSE 'credit_withdrawal' END,state='renuncia_confirmada',request_revision=q.revision,reason=p_reason,confirmed_by=auth.uid(),confirmed_at=now(),approved_by=NULL,approved_at=NULL,offered_by=NULL,offered_at=NULL,version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
  END IF;
 ELSIF p_action='approve_release' THEN
  IF s.state IS DISTINCT FROM 'renuncia_confirmada' THEN RAISE EXCEPTION 'Primero confirmá la renuncia'; END IF;
  IF q.revision<>s.request_revision OR q.choice NOT IN ('refund','credit') OR q.review_status<>'validada' THEN RAISE EXCEPTION 'La solicitud cambió después de confirmar la renuncia; revisá de nuevo'; END IF;
  IF r.reservation_status<>'reserva_confirmada' THEN RAISE EXCEPTION 'La reserva fuente ya no está vigente; revisión manual'; END IF;
  UPDATE rescheduling_seat_releases SET state='liberada',approved_by=auth.uid(),approved_at=now(),version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
 ELSIF p_action='offer' THEN
  IF s.state IS DISTINCT FROM 'liberada' THEN RAISE EXCEPTION 'Solo cupos liberados por administración'; END IF;
  IF NOT c.resale_enabled THEN RAISE EXCEPTION 'Reventa no habilitada para esta campaña'; END IF;
  UPDATE rescheduling_seat_releases SET state='ofrecida',offered_by=auth.uid(),offered_at=now(),version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
 ELSIF p_action='occupy' THEN
  IF s.state IS DISTINCT FROM 'ofrecida' THEN RAISE EXCEPTION 'Solo cupos ofrecidos pueden ocuparse'; END IF;
  IF NOT c.resale_enabled THEN RAISE EXCEPTION 'Reventa no habilitada para esta campaña'; END IF;
  SELECT o INTO opt FROM jsonb_array_elements(c.options) o WHERE o->>'value'=p_window AND o ? 'start' AND o ? 'end';
  IF opt IS NULL THEN RAISE EXCEPTION 'Ventana de noches inválida'; END IF;
  SELECT * INTO rep FROM event_reservations WHERE id=p_replacement_reservation_id FOR UPDATE;
  IF rep.id IS NULL OR rep.id=r.id OR rep.event_id<>r.event_id OR rep.reservation_status<>'reserva_confirmada' OR rep.package_id IS DISTINCT FROM s.package_id THEN RAISE EXCEPTION 'El reemplazo debe ser una reserva vigente del mismo evento y paquete'; END IF;
  IF rep.created_at<=s.approved_at THEN RAISE EXCEPTION 'El reemplazo debe ser posterior a la liberación aprobada'; END IF;
  IF EXISTS (SELECT 1 FROM rescheduling_seat_releases WHERE source_reservation_id=rep.id AND state<>'anulada') THEN RAISE EXCEPTION 'El reemplazo no puede ser una plaza liberada'; END IF;
  INSERT INTO rescheduling_seat_occupancies(release_id,replacement_reservation_id,window_choice,nights,created_by)
  VALUES(s.id,rep.id,p_window,daterange((opt->>'start')::date,(opt->>'end')::date,'[)'),auth.uid());
  UPDATE rescheduling_seat_releases SET state='ocupada',version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
 ELSE
  IF s.state IS NULL OR s.state NOT IN ('renuncia_confirmada','liberada','ofrecida') THEN RAISE EXCEPTION 'Solo se anulan cupos no ocupados'; END IF;
  UPDATE rescheduling_seat_releases SET state='anulada',revoked_by=auth.uid(),revoked_at=now(),revoke_reason=p_reason,version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
 END IF;
 INSERT INTO rescheduling_seat_history(release_id,command_id,action,actor_id,reason,before_data,after_data) VALUES(s.id,p_command_id,p_action,auth.uid(),p_reason,old,to_jsonb(s));
 RETURN to_jsonb(s);
END $$;
REVOKE ALL ON FUNCTION public.admin_rescheduling_seat_action(uuid,text,text,integer,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rescheduling_seat_action(uuid,text,text,integer,uuid,uuid,text) TO authenticated, service_role;

CREATE FUNCTION public.admin_rescheduling_inventory(p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c event_rescheduling_campaigns%ROWTYPE; res jsonb;
BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 SELECT * INTO c FROM event_rescheduling_campaigns WHERE event_id=p_event_id;
 IF c.event_id IS NULL THEN RETURN jsonb_build_object('available',false); END IF;
 SELECT jsonb_build_object(
  'available',true,'resale_enabled',c.resale_enabled,'public_enabled',c.public_enabled,
  'active_reservations',(SELECT count(*) FROM event_reservations WHERE event_id=p_event_id AND reservation_status='reserva_confirmada'),
  'unreviewed',(SELECT count(*) FROM reservation_rescheduling_requests WHERE event_id=p_event_id AND review_status IN ('pendiente','en_revision')),
  'by_choice',(SELECT coalesce(jsonb_object_agg(choice,n),'{}') FROM (SELECT choice,count(*) n FROM reservation_rescheduling_requests WHERE event_id=p_event_id GROUP BY choice) x),
  'refund_validated',(SELECT count(*) FROM reservation_rescheduling_requests WHERE event_id=p_event_id AND choice='refund' AND review_status='validada'),
  'releases',(SELECT coalesce(jsonb_agg(jsonb_build_object('reservation_id',s.source_reservation_id,'package_id',s.package_id,'kind',s.kind,'state',s.state,'version',s.version,'approved_at',s.approved_at,
     'stale',(q.revision IS DISTINCT FROM s.request_revision AND s.state='renuncia_confirmada'),
     'occupancy',(SELECT jsonb_build_object('window',o.window_choice,'replacement_reservation_id',o.replacement_reservation_id) FROM rescheduling_seat_occupancies o WHERE o.release_id=s.id))),'[]')
     FROM rescheduling_seat_releases s LEFT JOIN reservation_rescheduling_requests q ON q.reservation_id=s.source_reservation_id WHERE s.event_id=p_event_id),
  'packages',(SELECT coalesce(jsonb_agg(jsonb_build_object('package_id',p.id,'name',p.nombre,
     'active',(SELECT count(*) FROM event_reservations e WHERE e.package_id=p.id AND e.reservation_status='reserva_confirmada'),
     'confirmed',(SELECT count(*) FROM rescheduling_seat_releases s WHERE s.package_id=p.id AND s.event_id=p_event_id AND s.state='renuncia_confirmada'),
     'released',(SELECT count(*) FROM rescheduling_seat_releases s WHERE s.package_id=p.id AND s.event_id=p_event_id AND s.state='liberada'),
     'offered',(SELECT count(*) FROM rescheduling_seat_releases s WHERE s.package_id=p.id AND s.event_id=p_event_id AND s.state='ofrecida'),
     'occupied',(SELECT count(*) FROM rescheduling_seat_releases s WHERE s.package_id=p.id AND s.event_id=p_event_id AND s.state='ocupada'),
     'sellable',CASE WHEN c.resale_enabled THEN (SELECT count(*) FROM rescheduling_seat_releases s WHERE s.package_id=p.id AND s.event_id=p_event_id AND s.state='ofrecida') ELSE 0 END
    ) ORDER BY p.sort_order),'[]') FROM event_packages p WHERE p.event_id=p_event_id),
  'windows',(SELECT coalesce(jsonb_agg(jsonb_build_object('value',o->>'value','label',o->>'label','start',o->>'start','end',o->>'end','nights',(o->>'nights')::int)),'[]') FROM jsonb_array_elements(c.options) o WHERE o ? 'start')
 ) INTO res;
 RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.admin_rescheduling_inventory(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rescheduling_inventory(uuid) TO authenticated, service_role;