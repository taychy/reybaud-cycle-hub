
-- Tabla de paquetes (tipos de habitación) por evento
CREATE TABLE public.event_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio NUMERIC NOT NULL CHECK (precio >= 0),
  sena NUMERIC CHECK (sena IS NULL OR sena >= 0),
  currency TEXT NOT NULL DEFAULT 'ARS',
  cupo INTEGER CHECK (cupo IS NULL OR cupo >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_packages_event ON public.event_packages(event_id, sort_order);

GRANT SELECT ON public.event_packages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.event_packages TO authenticated;
GRANT ALL ON public.event_packages TO service_role;

ALTER TABLE public.event_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_packages readable by everyone"
ON public.event_packages FOR SELECT USING (true);

CREATE POLICY "event_packages admin insert"
ON public.event_packages FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

CREATE POLICY "event_packages admin update"
ON public.event_packages FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

CREATE POLICY "event_packages admin delete"
ON public.event_packages FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

CREATE TRIGGER update_event_packages_updated_at
BEFORE UPDATE ON public.event_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vincular paquete a reservas y participantes (nullable: compat con eventos sin paquetes)
ALTER TABLE public.event_reservations
  ADD COLUMN package_id UUID REFERENCES public.event_packages(id) ON DELETE SET NULL,
  ADD COLUMN package_nombre_snapshot TEXT;

ALTER TABLE public.event_participants
  ADD COLUMN package_id UUID REFERENCES public.event_packages(id) ON DELETE SET NULL,
  ADD COLUMN package_nombre_snapshot TEXT;

CREATE INDEX idx_event_reservations_package ON public.event_reservations(package_id);
CREATE INDEX idx_event_participants_package ON public.event_participants(package_id);
