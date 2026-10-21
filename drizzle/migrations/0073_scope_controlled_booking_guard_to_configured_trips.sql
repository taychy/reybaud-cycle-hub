DO $scope$
DECLARE definition text; old_block text := E' IF NOT FOUND THEN\n  IF EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id AND metadata->\'reservation_request\'->>\'mode\'=\'pending_no_payment\') AND TG_OP=\'INSERT\' THEN RAISE EXCEPTION \'Solo solicitudes sin pago hasta configurar apertura segura\'; END IF;\n  RETURN NEW;\n END IF;';
BEGIN
 SELECT pg_get_functiondef('public.guard_controlled_booking()'::regprocedure) INTO definition;
 IF strpos(definition,old_block)=0 THEN RAISE EXCEPTION 'Expected controlled booking guard definition not found'; END IF;
 EXECUTE replace(definition,old_block,' IF NOT FOUND THEN RETURN NEW; END IF;');
END $scope$;