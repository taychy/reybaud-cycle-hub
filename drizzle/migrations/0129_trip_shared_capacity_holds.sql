CREATE TABLE public.trip_capacity_pools (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,total_capacity integer NOT NULL CHECK(total_capacity>0),payment_handoff_enabled boolean NOT NULL DEFAULT false CHECK(payment_handoff_enabled=false));
GRANT SELECT ON public.trip_capacity_pools TO authenticated; GRANT ALL ON public.trip_capacity_pools TO service_role;
ALTER TABLE public.trip_capacity_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY pool_admin_read ON public.trip_capacity_pools FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE TABLE public.trip_capacity_events (event_id uuid PRIMARY KEY REFERENCES public.events(id),pool_id uuid NOT NULL REFERENCES public.trip_capacity_pools(id),commercial_cap integer NOT NULL CHECK(commercial_cap>0),check_in date NOT NULL,check_out date NOT NULL CHECK(check_out>check_in));
GRANT SELECT ON public.trip_capacity_events TO authenticated; GRANT ALL ON public.trip_capacity_events TO service_role;
ALTER TABLE public.trip_capacity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_event_admin_read ON public.trip_capacity_events FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE TABLE public.trip_capacity_groups (pool_id uuid NOT NULL REFERENCES public.trip_capacity_pools(id),group_key text NOT NULL,room_count integer NOT NULL CHECK(room_count>0),places_per_room integer NOT NULL CHECK(places_per_room>0),PRIMARY KEY(pool_id,group_key));
GRANT SELECT ON public.trip_capacity_groups TO authenticated; GRANT ALL ON public.trip_capacity_groups TO service_role;
ALTER TABLE public.trip_capacity_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_group_admin_read ON public.trip_capacity_groups FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE TABLE public.trip_capacity_packages (package_id uuid PRIMARY KEY REFERENCES public.event_packages(id),pool_id uuid NOT NULL,group_key text NOT NULL,FOREIGN KEY(pool_id,group_key) REFERENCES public.trip_capacity_groups(pool_id,group_key));
GRANT SELECT ON public.trip_capacity_packages TO authenticated; GRANT ALL ON public.trip_capacity_packages TO service_role;
ALTER TABLE public.trip_capacity_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_package_admin_read ON public.trip_capacity_packages FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE TABLE public.trip_capacity_holds (request_id uuid PRIMARY KEY REFERENCES public.event_enrollment_requests(id),pool_id uuid NOT NULL,group_key text NOT NULL,people_count integer NOT NULL CHECK(people_count>0),approved_unit_price numeric NOT NULL CHECK(approved_unit_price>0),held_by uuid NOT NULL,held_at timestamptz NOT NULL DEFAULT now(),hold_note text NOT NULL,released_at timestamptz,released_by uuid,release_note text,FOREIGN KEY(pool_id,group_key) REFERENCES public.trip_capacity_groups(pool_id,group_key));
COMMENT ON TABLE public.trip_capacity_holds IS 'Administrative inventory retention only, not a confirmed reservation or payable charge. No expiry: release explicitly with audit. Native payment handoff remains closed.';
GRANT SELECT ON public.trip_capacity_holds TO authenticated; GRANT ALL ON public.trip_capacity_holds TO service_role;
ALTER TABLE public.trip_capacity_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_hold_admin_read ON public.trip_capacity_holds FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
INSERT INTO public.trip_capacity_pools(id,name,total_capacity) VALUES('07180718-2027-4027-8027-000000000039','San Luis enero 2027',39);
INSERT INTO public.trip_capacity_events VALUES('408a8eb8-fb62-4a50-ad6d-040bd5716797','07180718-2027-4027-8027-000000000039',30,'2027-01-18','2027-01-24'),('5380df24-6bbf-4d25-81cd-a1ab2b41bd94','07180718-2027-4027-8027-000000000039',15,'2027-01-21','2027-01-24');
INSERT INTO public.trip_capacity_groups VALUES('07180718-2027-4027-8027-000000000039','hotel_individual',10,1),('07180718-2027-4027-8027-000000000039','hotel_doble',10,2),('07180718-2027-4027-8027-000000000039','cabana_3_plazas',3,3);
INSERT INTO public.trip_capacity_packages(package_id,pool_id,group_key) SELECT p.id,c.pool_id,CASE WHEN lower(p.nombre) LIKE '%cabaña%' THEN 'cabana_3_plazas' WHEN lower(p.nombre) LIKE '%individual%' THEN 'hotel_individual' ELSE 'hotel_doble' END FROM public.event_packages p JOIN public.trip_capacity_events c ON c.event_id=p.event_id;
CREATE OR REPLACE FUNCTION public.get_trip_request_capacity(p_event_id uuid,p_package_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; g record; n date; used_total integer; used_group integer; used_camp integer; available integer;
BEGIN
 SELECT e.*,p.total_capacity INTO c FROM public.trip_capacity_events e JOIN public.trip_capacity_pools p ON p.id=e.pool_id WHERE e.event_id=p_event_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
 SELECT grp.* INTO g FROM public.trip_capacity_packages m JOIN public.trip_capacity_groups grp USING(pool_id,group_key) JOIN public.event_packages p ON p.id=m.package_id WHERE m.package_id=p_package_id AND p.event_id=p_event_id AND m.pool_id=c.pool_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
 SELECT coalesce(sum(h.people_count),0) INTO used_camp FROM public.trip_capacity_holds h JOIN public.event_enrollment_requests r ON r.id=h.request_id WHERE h.released_at IS NULL AND r.event_id=p_event_id;
 available:=c.commercial_cap-used_camp;
 FOR n IN SELECT generate_series(c.check_in,c.check_out-1,interval '1 day')::date LOOP
 SELECT coalesce(sum(h.people_count),0),coalesce(sum(h.people_count) FILTER(WHERE h.group_key=g.group_key),0) INTO used_total,used_group FROM public.trip_capacity_holds h JOIN public.event_enrollment_requests r ON r.id=h.request_id JOIN public.trip_capacity_events e ON e.event_id=r.event_id WHERE h.pool_id=c.pool_id AND h.released_at IS NULL AND e.check_in<=n AND e.check_out>n;
 available:=least(available,c.total_capacity-used_total,g.room_count*g.places_per_room-used_group);
 END LOOP;
 RETURN jsonb_build_object('ok',true,'remaining',greatest(0,available),'total_capacity',c.total_capacity,'group_capacity',g.room_count*g.places_per_room,'commercial_cap',c.commercial_cap,'payment_enabled',false,'requires_hotel_validation',true);
END $$;
REVOKE ALL ON FUNCTION public.get_trip_request_capacity(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trip_request_capacity(uuid,uuid) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_hold_trip_request_capacity(p_request_id uuid,p_release boolean,p_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.event_enrollment_requests%ROWTYPE; m record; h public.trip_capacity_holds%ROWTYPE; a jsonb; actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR NOT(public.has_role(actor,'admin'::public.app_role) OR public.is_super_admin(actor)) THEN RAISE EXCEPTION 'Solo administración puede retener plazas'; END IF;
 IF length(trim(coalesce(p_note,'')))<3 THEN RAISE EXCEPTION 'Indicá la validación del hotel o el motivo de liberación'; END IF;
 SELECT c.pool_id INTO m FROM public.event_enrollment_requests req JOIN public.trip_capacity_events c ON c.event_id=req.event_id WHERE req.id=p_request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud fuera del circuito de inventario'; END IF;
 PERFORM 1 FROM public.trip_capacity_pools WHERE id=m.pool_id FOR UPDATE;
 SELECT * INTO r FROM public.event_enrollment_requests WHERE id=p_request_id FOR UPDATE;
 SELECT * INTO h FROM public.trip_capacity_holds WHERE request_id=p_request_id;
 IF p_release IS TRUE THEN
 IF h.request_id IS NULL OR h.released_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'held',false,'duplicate',true); END IF;
 UPDATE public.trip_capacity_holds SET released_at=now(),released_by=actor,release_note=trim(p_note) WHERE request_id=p_request_id;
 ELSE
 IF h.request_id IS NOT NULL AND h.released_at IS NULL THEN RETURN jsonb_build_object('ok',true,'held',true,'duplicate',true,'payment_enabled',false); END IF;
 IF r.status<>'aprobada_cotizacion' OR NOT r.hotel_validated OR r.approved_unit_price IS NULL THEN RAISE EXCEPTION 'Primero aprobá la cotización y validá con el hotel a todas las personas'; END IF;
 SELECT * INTO m FROM public.trip_capacity_packages WHERE package_id=r.package_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Paquete sin inventario compartido'; END IF;
 a:=public.get_trip_request_capacity(r.event_id,r.package_id);
 IF coalesce((a->>'remaining')::integer,0)<r.people_count THEN RAISE EXCEPTION 'No hay plazas suficientes en el inventario compartido'; END IF;
 INSERT INTO public.trip_capacity_holds(request_id,pool_id,group_key,people_count,approved_unit_price,held_by,hold_note) VALUES(r.id,m.pool_id,m.group_key,r.people_count,r.approved_unit_price,actor,trim(p_note)) ON CONFLICT(request_id) DO UPDATE SET released_at=NULL,released_by=NULL,release_note=NULL,held_at=now(),held_by=actor,hold_note=trim(p_note),approved_unit_price=excluded.approved_unit_price,pool_id=excluded.pool_id,group_key=excluded.group_key,people_count=excluded.people_count;
 END IF;
 INSERT INTO public.event_enrollment_request_history(request_id,actor_user_id,action,from_status,to_status,review_note,details) VALUES(r.id,actor,CASE WHEN p_release IS TRUE THEN 'inventario_liberado' ELSE 'inventario_retenido' END,r.status,r.status,trim(p_note),jsonb_build_object('people_count',r.people_count,'payment_enabled',false));
 RETURN jsonb_build_object('ok',true,'held',p_release IS DISTINCT FROM true,'payment_enabled',false);
END $$;
REVOKE ALL ON FUNCTION public.admin_hold_trip_request_capacity(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_hold_trip_request_capacity(uuid,boolean,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public._trip_request_hold_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.trip_capacity_holds WHERE request_id=OLD.id AND released_at IS NULL) THEN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Liberá primero la retención administrativa'; END IF;
 IF (NEW.event_id,NEW.package_id,NEW.people_count,NEW.attendees,NEW.hotel_validated,NEW.approved_unit_price,NEW.status,NEW.email) IS DISTINCT FROM (OLD.event_id,OLD.package_id,OLD.people_count,OLD.attendees,OLD.hotel_validated,OLD.approved_unit_price,OLD.status,OLD.email) THEN RAISE EXCEPTION 'Liberá primero la retención antes de cambiar personas, paquete, precio o estado'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER trip_request_hold_guard BEFORE UPDATE OR DELETE ON public.event_enrollment_requests FOR EACH ROW EXECUTE FUNCTION public._trip_request_hold_guard();
CREATE OR REPLACE FUNCTION public._trip_capacity_native_closed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.trip_capacity_events WHERE event_id=NEW.event_id) THEN RAISE EXCEPTION 'Reserva y cobro bloqueados: falta conectar retención, condiciones aceptadas y plan nativo en una única transacción'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER trip_capacity_native_closed BEFORE INSERT OR UPDATE OF event_id ON public.event_reservations FOR EACH ROW EXECUTE FUNCTION public._trip_capacity_native_closed();