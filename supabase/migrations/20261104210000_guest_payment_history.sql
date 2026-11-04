-- Historial de cobros para participantes externos, autenticado por su token privado.
-- No modifica pagos ni reservas. Retorna solo movimientos de sus propias reservas.
CREATE OR REPLACE FUNCTION public.get_guest_payment_history_by_token(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN _token IS NULL OR length(_token) < 8 THEN NULL
    ELSE (
      SELECT COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'reservation_id', r.id,
              'payment_date', p.payment_date,
              'amount', COALESCE(
                p.equivalent_amount_event_currency,
                CASE WHEN p.currency = COALESCE(r.currency_snapshot, r.moneda)
                  THEN p.amount ELSE NULL END
              ),
              'currency', COALESCE(r.currency_snapshot, r.moneda),
              'method', p.payment_method,
              'status', p.status
            )
            ORDER BY p.payment_date DESC NULLS LAST, p.created_at DESC, p.id
          )
          FROM public.event_reservations r
          JOIN public.reservation_payments p ON p.reservation_id = r.id
          WHERE r.external_participant_id = ep.id
            AND p.status IN ('validado', 'anulado')
        ),
        '[]'::jsonb
      )
      FROM public.event_external_participants ep
      WHERE ep.access_token = _token
        AND ep.estado = 'activo'
      LIMIT 1
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.get_guest_payment_history_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_payment_history_by_token(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_guest_payment_history_by_token(text)
IS 'Devuelve exclusivamente movimientos validados/anulados de reservas del participante externo identificado por token. Sin datos fiscales, comprobantes ni notas internas.';
