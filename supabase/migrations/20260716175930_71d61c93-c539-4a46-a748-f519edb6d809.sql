
CREATE OR REPLACE FUNCTION public.get_guest_reservation_by_token(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_participant public.event_external_participants%ROWTYPE;
  v_result jsonb;
BEGIN
  IF _token IS NULL OR length(_token) < 8 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_participant
  FROM public.event_external_participants
  WHERE access_token = _token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'participant', to_jsonb(v_participant),
    'reservations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'event_id', r.event_id,
        'reservation_status', r.reservation_status,
        'payment_status', r.payment_status,
        'amount_total', r.amount_total,
        'amount_paid', r.amount_paid,
        'balance_due', r.balance_due,
        'currency_snapshot', r.currency_snapshot,
        'package_nombre_snapshot', r.package_nombre_snapshot,
        'next_due_date', r.next_due_date,
        'created_at', r.created_at,
        'event', (
          SELECT jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'date', e.date,
            'end_date', e.end_date,
            'image_url', e.image_url,
            'location', e.location,
            'short_description', e.short_description
          ) FROM public.events e WHERE e.id = r.event_id
        ),
        'installments', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id,
            'numero', i.numero,
            'monto', i.monto,
            'monto_pagado', i.monto_pagado,
            'fecha_vencimiento', i.fecha_vencimiento,
            'estado', i.estado
          ) ORDER BY i.numero)
          FROM public.reservation_installments i WHERE i.reservation_id = r.id
        ), '[]'::jsonb)
      ) ORDER BY r.created_at DESC)
      FROM public.event_reservations r
      WHERE r.external_participant_id = v_participant.id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END; $$;
