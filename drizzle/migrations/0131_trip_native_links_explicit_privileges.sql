REVOKE ALL ON TABLE public.trip_capacity_reservation_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.trip_capacity_reservation_links TO authenticated;
GRANT ALL ON TABLE public.trip_capacity_reservation_links TO service_role;