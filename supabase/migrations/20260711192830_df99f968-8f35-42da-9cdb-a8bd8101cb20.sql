
CREATE TABLE public.roadbook_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  roadbook jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadbook_templates TO authenticated;
GRANT ALL ON public.roadbook_templates TO service_role;

ALTER TABLE public.roadbook_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gestionan plantillas roadbook"
  ON public.roadbook_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_roadbook_templates_updated_at
  BEFORE UPDATE ON public.roadbook_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.roadbook_prospect_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  nombre text NOT NULL,
  apellido text NOT NULL,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  opened_at timestamptz,
  open_count int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_roadbook_prospect_links_event ON public.roadbook_prospect_links(event_id);
CREATE INDEX idx_roadbook_prospect_links_token ON public.roadbook_prospect_links(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadbook_prospect_links TO authenticated;
GRANT ALL ON public.roadbook_prospect_links TO service_role;

ALTER TABLE public.roadbook_prospect_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gestionan links prospectos"
  ON public.roadbook_prospect_links FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

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

  SELECT id, titulo, roadbook, imagen_url, fecha_inicio, fecha_fin
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
      'titulo', _event_row.titulo,
      'imagen_url', _event_row.imagen_url,
      'fecha_inicio', _event_row.fecha_inicio,
      'fecha_fin', _event_row.fecha_fin
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

GRANT EXECUTE ON FUNCTION public.get_prospect_roadbook(text) TO anon, authenticated;
