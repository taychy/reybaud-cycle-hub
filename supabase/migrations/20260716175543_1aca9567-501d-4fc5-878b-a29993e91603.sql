
-- Campos faltantes en event_external_participants
ALTER TABLE public.event_external_participants
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono text,
  ADD COLUMN IF NOT EXISTS access_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_external_participants_token
  ON public.event_external_participants(access_token);
CREATE INDEX IF NOT EXISTS idx_event_external_participants_email_lower
  ON public.event_external_participants(LOWER(email));

-- RPC pública para obtener la reserva por token (usada por mini-app /mi-reserva/:token)
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
            'nombre', e.nombre,
            'fecha_inicio', e.fecha_inicio,
            'fecha_fin', e.fecha_fin,
            'imagen_url', e.imagen_url,
            'ubicacion', e.ubicacion,
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

REVOKE ALL ON FUNCTION public.get_guest_reservation_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_reservation_by_token(text) TO anon, authenticated;
