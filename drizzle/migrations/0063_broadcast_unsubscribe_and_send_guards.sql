CREATE TABLE public.broadcast_send_guards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL, payload_hash text NOT NULL,
 audience_hash text NOT NULL, eligible_count integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 test_accepted_at timestamptz, claimed_at timestamptz, broadcast_id uuid UNIQUE, test_message_id text
);
GRANT ALL ON public.broadcast_send_guards TO service_role;
ALTER TABLE public.broadcast_send_guards ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.broadcast_dispatch_claims (
 broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id), email text NOT NULL, claimed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(broadcast_id,email)
);
GRANT ALL ON public.broadcast_dispatch_claims TO service_role;
ALTER TABLE public.broadcast_dispatch_claims ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.issue_broadcast_unsubscribe(p_email text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE raw_token text; BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF length(p_email)>255 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'invalid email'; END IF;
 raw_token := encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.email_unsubscribe_tokens(token,email) VALUES ('bc:'||encode(extensions.digest(raw_token,'sha256'),'hex'),lower(trim(p_email)));
 RETURN raw_token; END $$;
REVOKE ALL ON FUNCTION public.issue_broadcast_unsubscribe(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_broadcast_unsubscribe(text) TO service_role;
CREATE OR REPLACE FUNCTION public.unsubscribe_broadcast(p_token text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_id uuid; v_email text; BEGIN
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
 SELECT id,email INTO v_id,v_email FROM public.email_unsubscribe_tokens WHERE token='bc:'||encode(extensions.digest(p_token,'sha256'),'hex') FOR UPDATE;
 IF v_id IS NULL THEN RETURN false; END IF;
 UPDATE public.email_unsubscribe_tokens SET used_at=coalesce(used_at,now()) WHERE id=v_id;
 UPDATE public.marketing_contacts SET opt_in_marketing=false,opt_out_at=coalesce(opt_out_at,now()) WHERE lower(trim(email))=v_email AND opt_in_marketing IS DISTINCT FROM false;
 INSERT INTO public.suppressed_emails(email,reason,metadata) VALUES(v_email,'unsubscribe',jsonb_build_object('source','broadcast_link')) ON CONFLICT(email) DO NOTHING;
 RETURN true; END $$;
REVOKE ALL ON FUNCTION public.unsubscribe_broadcast(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_broadcast(text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.claim_broadcast_send(p_guard uuid,p_actor uuid,p_payload text,p_audience text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.broadcast_send_guards; bid uuid; BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(p_actor,'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_payload,0));
 SELECT * INTO g FROM public.broadcast_send_guards WHERE id=p_guard AND actor_id=p_actor FOR UPDATE;
 IF g.id IS NULL OR g.payload_hash<>p_payload OR g.audience_hash<>p_audience THEN RAISE EXCEPTION 'Vista previa desactualizada'; END IF;
 IF g.broadcast_id IS NOT NULL THEN RETURN g.broadcast_id; END IF;
 IF g.created_at<now()-interval '30 minutes' OR g.test_accepted_at IS NULL OR g.eligible_count=0 THEN RAISE EXCEPTION 'Recalculá destinatarios y enviá una prueba antes de confirmar'; END IF;
 SELECT broadcast_id INTO bid FROM public.broadcast_send_guards WHERE payload_hash=p_payload AND broadcast_id IS NOT NULL LIMIT 1;
 IF bid IS NOT NULL THEN RAISE EXCEPTION 'Esta campaña ya fue iniciada; consultá el historial'; END IF;
 bid:=gen_random_uuid();
 UPDATE public.broadcast_send_guards SET claimed_at=now(),broadcast_id=bid WHERE id=g.id;
 RETURN bid; END $$;
REVOKE ALL ON FUNCTION public.claim_broadcast_send(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_broadcast_send(uuid,uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_broadcast_recipient(p_broadcast uuid,p_email text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF EXISTS(SELECT 1 FROM public.suppressed_emails WHERE lower(trim(email))=lower(trim(p_email))) OR EXISTS(SELECT 1 FROM public.marketing_contacts WHERE lower(trim(email))=lower(trim(p_email)) AND opt_in_marketing IS DISTINCT FROM true) THEN RETURN false; END IF;
 INSERT INTO public.broadcast_dispatch_claims(broadcast_id,email) VALUES(p_broadcast,lower(trim(p_email))) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1; END $$;
REVOKE ALL ON FUNCTION public.claim_broadcast_recipient(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_broadcast_recipient(uuid,text) TO service_role;