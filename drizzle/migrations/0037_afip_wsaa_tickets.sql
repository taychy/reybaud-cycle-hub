CREATE TABLE IF NOT EXISTS public.afip_wsaa_tickets (
  emisor_id uuid NOT NULL REFERENCES public.emisores_fiscales(id) ON DELETE CASCADE,
  service text NOT NULL,
  token text NOT NULL,
  sign text NOT NULL,
  expires_at timestamptz NOT NULL,
  obtained_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (emisor_id, service)
);
COMMENT ON TABLE public.afip_wsaa_tickets IS 'Ticket de acceso WSAA (TA) vigente por emisor/servicio. Solo backend (service_role); nunca exponer al frontend.';
REVOKE ALL ON public.afip_wsaa_tickets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.afip_wsaa_tickets TO service_role;
ALTER TABLE public.afip_wsaa_tickets ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo service_role (bypass RLS) puede leer/escribir.