GRANT SELECT ON TABLE public.event_addons TO anon;
GRANT SELECT ON TABLE public.event_addons TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.event_addons TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reservation_addons TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.reservation_addons TO service_role;