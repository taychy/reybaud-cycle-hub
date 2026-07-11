CREATE OR REPLACE FUNCTION public.get_prospect_roadbook(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _link public.roadbook_prospect_links%ROWTYPE;
  _event_row record;
  _rb jsonb;
  _teaser_dias jsonb;
BEGIN
  SELECT * INTO _link FROM public.roadbook_prospect_links WHERE token = _token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF _link.expires_at < now() THEN
    RETURN jsonb_build_object(
      'status', 'expired',
      'nombre', _link.nombre,
      'event_id', _link.event_id
    );
  END IF;

  SELECT id, title, roadbook, image_url, date, end_date
    INTO _event_row
    FROM public.events
    WHERE id = _link.event_id;

  _rb := COALESCE(_event_row.roadbook, '{}'::jsonb);

  SELECT COALESCE(jsonb_agg((d - 'hotel' - 'gpx_url')), '[]'::jsonb)
  INTO _teaser_dias
  FROM jsonb_array_elements(COALESCE(_rb->'dias', '[]'::jsonb)) d;

  UPDATE public.roadbook_prospect_links
     SET opened_at = COALESCE(opened_at, now()),
         open_count = open_count + 1
   WHERE id = _link.id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'nombre', _link.nombre,
    'apellido', _link.apellido,
    'event', jsonb_build_object(
      'id', _event_row.id,
      'titulo', _event_row.title,
      'imagen_url', _event_row.image_url,
      'fecha_inicio', _event_row.date,
      'fecha_fin', _event_row.end_date
    ),
    'roadbook', jsonb_build_object(
      'intro', _rb->'intro',
      'fechas_label', _rb->'fechas_label',
      'recorrido_label', _rb->'recorrido_label',
      'dias', _teaser_dias,
      'bienvenida', _rb->'bienvenida',
      'clima', _rb->'clima',
      'salida', _rb->'salida'
    )
  );
END;
$$;