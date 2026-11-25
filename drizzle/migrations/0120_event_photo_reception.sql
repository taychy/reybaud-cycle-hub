CREATE TABLE public.event_photo_settings (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  max_files_per_submission integer NOT NULL DEFAULT 10 CHECK (max_files_per_submission BETWEEN 1 AND 10),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.event_photo_settings TO authenticated;
GRANT ALL ON public.event_photo_settings TO service_role;
ALTER TABLE public.event_photo_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read photo settings" ON public.event_photo_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TABLE public.event_photo_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  submitter_name text NOT NULL CHECK (length(submitter_name) BETWEEN 2 AND 120),
  submitter_email text NOT NULL CHECK (length(submitter_email) BETWEEN 5 AND 254),
  user_id uuid,
  ownership_declared boolean NOT NULL CHECK (ownership_declared),
  ownership_text_version text NOT NULL,
  ownership_accepted_at timestamptz NOT NULL,
  publication_consent boolean NOT NULL DEFAULT false,
  publication_consent_text_version text,
  publication_consent_at timestamptz,
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','complete','failed')),
  finalize_token_hash text NOT NULL,
  client_fingerprint text,
  file_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((publication_consent AND publication_consent_at IS NOT NULL AND publication_consent_text_version IS NOT NULL) OR NOT publication_consent)
);
CREATE INDEX event_photo_submissions_event_idx ON public.event_photo_submissions(event_id, created_at DESC);
CREATE INDEX event_photo_submissions_fp_idx ON public.event_photo_submissions(client_fingerprint, created_at DESC);
CREATE INDEX event_photo_submissions_email_idx ON public.event_photo_submissions(lower(submitter_email), created_at DESC);
GRANT SELECT ON public.event_photo_submissions TO authenticated;
GRANT ALL ON public.event_photo_submissions TO service_role;
ALTER TABLE public.event_photo_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read photo submissions" ON public.event_photo_submissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TABLE public.event_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.event_photo_submissions(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  original_filename text,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
  upload_status text NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending','stored','failed')),
  review_status text NOT NULL DEFAULT 'pendiente' CHECK (review_status IN ('pendiente','apta_publicacion','solo_interna','rechazada')),
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_photos_submission_idx ON public.event_photos(submission_id);
CREATE INDEX event_photos_event_idx ON public.event_photos(event_id, review_status, created_at DESC);
GRANT SELECT ON public.event_photos TO authenticated;
GRANT ALL ON public.event_photos TO service_role;
ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read event photos" ON public.event_photos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- Nunca apta para publicación sin consentimiento de difusión.
CREATE OR REPLACE FUNCTION public.event_photos_guard_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.review_status = 'apta_publicacion' AND NOT EXISTS (
    SELECT 1 FROM event_photo_submissions s WHERE s.id = NEW.submission_id AND s.publication_consent
  ) THEN
    RAISE EXCEPTION 'La foto no tiene consentimiento de difusión' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER event_photos_guard_publication BEFORE INSERT OR UPDATE OF review_status ON public.event_photos
  FOR EACH ROW EXECUTE FUNCTION public.event_photos_guard_publication();

CREATE OR REPLACE FUNCTION public.admin_set_event_photo_reception(p_event_id uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row event_photo_settings;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN RAISE EXCEPTION 'Evento inexistente'; END IF;
  INSERT INTO event_photo_settings(event_id, enabled, updated_by) VALUES (p_event_id, coalesce(p_enabled,false), auth.uid())
  ON CONFLICT (event_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = auth.uid(), updated_at = now()
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('event_id', v_row.event_id, 'enabled', v_row.enabled);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_event_photo_reception(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_event_photo_reception(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_event_photos(p_photo_ids uuid[], p_status text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_blocked integer; v_updated integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('pendiente','apta_publicacion','solo_interna','rechazada') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  IF p_photo_ids IS NULL OR array_length(p_photo_ids,1) IS NULL OR array_length(p_photo_ids,1) > 500 THEN RAISE EXCEPTION 'Selección inválida'; END IF;
  IF p_status = 'apta_publicacion' THEN
    SELECT count(*) INTO v_blocked FROM event_photos p JOIN event_photo_submissions s ON s.id = p.submission_id
      WHERE p.id = ANY(p_photo_ids) AND NOT s.publication_consent;
    IF v_blocked > 0 THEN
      RAISE EXCEPTION '% foto(s) no tienen consentimiento de difusión; no se marcó ninguna', v_blocked USING ERRCODE = '23514';
    END IF;
  END IF;
  UPDATE event_photos SET review_status = p_status, review_note = nullif(trim(coalesce(p_note,'')),''),
    reviewed_by = CASE WHEN p_status = 'pendiente' THEN NULL ELSE auth.uid() END,
    reviewed_at = CASE WHEN p_status = 'pendiente' THEN NULL ELSE now() END
  WHERE id = ANY(p_photo_ids) AND upload_status = 'stored';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated);
END $$;
REVOKE ALL ON FUNCTION public.admin_review_event_photos(uuid[], text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_event_photos(uuid[], text, text) TO authenticated;

-- Storage: bucket privado, solo administradores pueden leer (URLs firmadas). Sin INSERT público.
CREATE POLICY "Admins read event photos objects" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'event-photos' AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())));

INSERT INTO public.event_photo_settings(event_id, enabled)
SELECT id, true FROM public.events WHERE id = '612673be-3e8c-4c2f-b5ac-bce44dbaed0d'
ON CONFLICT (event_id) DO NOTHING;