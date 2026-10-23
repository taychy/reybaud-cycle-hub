CREATE OR REPLACE FUNCTION public.pago_consumido_legacy(_tipo text, _id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE _tipo
    WHEN 'mp_movement' THEN (
      EXISTS (
        SELECT 1 FROM public.mp_account_movements mp
        JOIN public.suscripciones s ON s.id = mp.suscripcion_id
        WHERE mp.id = _id
          AND s.cancelada_at IS NULL
          AND s.estado IN ('activa','pendiente_verificacion','vencida','finalizada','conciliado')
          AND public.is_subscription_paid(s.id)
      )
      OR EXISTS (
        SELECT 1 FROM public.mp_account_movements mp
        JOIN public.reservation_payments rp ON rp.id = mp.reservation_payment_id
        WHERE mp.id = _id
          AND rp.anulado_at IS NULL
          AND COALESCE(rp.status, '') <> 'rechazado'
      )
      OR EXISTS (
        SELECT 1 FROM public.mp_account_movements mp
        JOIN public.reservation_payments rp
          ON rp.alumno_id = mp.alumno_id
         AND (rp.mp_payment_id = mp.mp_payment_id OR rp.payment_reference = mp.mp_payment_id)
        WHERE mp.id = _id
          AND rp.anulado_at IS NULL
          AND rp.status = 'validado'
          AND COALESCE(rp.currency, 'ARS') = COALESCE(mp.currency, 'ARS')
          AND abs(COALESCE(rp.amount, 0) - abs(mp.amount)) <= 1
      )
    )
    ELSE false
  END;
$function$;
