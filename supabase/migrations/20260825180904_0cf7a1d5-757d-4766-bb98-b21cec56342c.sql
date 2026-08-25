-- 1) obligacion_monto: soporte 'turnera'
CREATE OR REPLACE FUNCTION public.obligacion_monto(_tipo text, _id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE _tipo
    WHEN 'suscripcion' THEN (SELECT COALESCE(s.precio_final, s.precio_base, p.precio, 0)
                               FROM public.suscripciones s LEFT JOIN public.planes p ON p.id = s.plan_id
                              WHERE s.id = _id)
    WHEN 'reserva' THEN (SELECT COALESCE(amount_total, 0) FROM public.event_reservations WHERE id = _id)
    WHEN 'store_order' THEN (SELECT COALESCE(total, 0) FROM public.store_orders WHERE id = _id)
    WHEN 'turnera' THEN (SELECT COALESCE(precio_snapshot, 0) FROM public.reservas_turnera WHERE id = _id)
    WHEN 'otro' THEN (SELECT monto FROM public.cuenta_ajustes WHERE id = _id)
    ELSE NULL
  END;
$function$;

-- 2) vista de obligaciones: agregar turnera
CREATE OR REPLACE VIEW public.vw_obligaciones_modelo_nuevo AS
 SELECT s.alumno_id,
    'suscripcion'::text AS obligacion_tipo,
    s.id AS obligacion_id,
    COALESCE(p.moneda, 'ARS'::text) AS moneda,
    COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric) AS monto,
    obligacion_imputado('suscripcion'::text, s.id) AS imputado
   FROM suscripciones s
     LEFT JOIN planes p ON p.id = s.plan_id
  WHERE s.cancelada_at IS NULL
UNION ALL
 SELECT r.alumno_id,
    'reserva'::text AS obligacion_tipo,
    r.id AS obligacion_id,
    COALESCE(r.currency_snapshot, r.moneda, 'ARS'::text) AS moneda,
    COALESCE(r.amount_total, 0::numeric) AS monto,
    obligacion_imputado('reserva'::text, r.id) AS imputado
   FROM event_reservations r
  WHERE r.cancelled_at IS NULL AND (COALESCE(r.reservation_status, ''::text) <> ALL (ARRAY['cancelada'::text, 'cancelled'::text, 'rechazada'::text]))
UNION ALL
 SELECT t.alumno_id,
    'turnera'::text AS obligacion_tipo,
    t.id AS obligacion_id,
    COALESCE(t.moneda_snapshot, 'ARS'::text) AS moneda,
    COALESCE(t.precio_snapshot, 0::numeric) AS monto,
    obligacion_imputado('turnera'::text, t.id) AS imputado
   FROM reservas_turnera t
  WHERE t.alumno_id IS NOT NULL
    AND COALESCE(t.estado_operativo, ''::text) NOT LIKE 'cancelada%'
    AND COALESCE(t.precio_snapshot, 0::numeric) > 0;

-- 3) auto-vinculación determinista de reservas de turnera a alumnos
CREATE OR REPLACE FUNCTION public.link_turnera_alumno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_doc text;
  v_id uuid;
  v_count int;
BEGIN
  -- Respetar decisiones explícitas: si ya hay alumno, o si se desvinculó a propósito, no tocar.
  IF NEW.alumno_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.alumno_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_email := NULLIF(lower(trim(COALESCE(NEW.email, ''))), '');
  v_doc := NULLIF(regexp_replace(COALESCE(NEW.documento, ''), '[^0-9]', '', 'g'), '');

  -- a) match exacto y unívoco por email (principal o adicional)
  IF v_email IS NOT NULL THEN
    SELECT count(*), min(a.id) INTO v_count, v_id
    FROM public.alumnos a
    WHERE lower(trim(COALESCE(a.email, ''))) = v_email
       OR EXISTS (
         SELECT 1 FROM unnest(COALESCE(a.emails_adicionales, ARRAY[]::text[])) ea
          WHERE lower(trim(ea)) = v_email
       );
    IF v_count = 1 THEN
      NEW.alumno_id := v_id;
      RETURN NEW;
    ELSIF v_count > 1 THEN
      RETURN NEW; -- ambiguo: no autoasignar
    END IF;
  END IF;

  -- b) match exacto y unívoco por documento normalizado
  IF v_doc IS NOT NULL AND length(v_doc) >= 7 THEN
    SELECT count(*), min(a.id) INTO v_count, v_id
    FROM public.alumnos a
    WHERE NULLIF(regexp_replace(COALESCE(a.documento, ''), '[^0-9]', '', 'g'), '') = v_doc;
    IF v_count = 1 THEN
      NEW.alumno_id := v_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_link_turnera_alumno ON public.reservas_turnera;
CREATE TRIGGER trg_link_turnera_alumno
BEFORE INSERT OR UPDATE OF alumno_id, email, documento ON public.reservas_turnera
FOR EACH ROW EXECUTE FUNCTION public.link_turnera_alumno();