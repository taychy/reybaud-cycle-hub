-- 1. TABLE
CREATE TABLE public.event_accommodation_waitlist_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id UUID NULL REFERENCES public.event_reservations(id) ON DELETE SET NULL,
  alumno_id UUID NULL REFERENCES public.alumnos(id) ON DELETE SET NULL,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.event_packages(id) ON DELETE CASCADE,
  -- Datos del prospecto (cuando no hay alumno_id, ej. reserva de invitado o pre-registro)
  prospect_nombre TEXT NULL,
  prospect_email TEXT NULL,
  prospect_telefono TEXT NULL,
  -- Preferencia de género (opcional)
  genero_preferido TEXT NULL CHECK (genero_preferido IS NULL OR genero_preferido IN ('femenina','masculina','mixta')),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','contactando_proveedor','confirmado','rechazado')),
  nota_alumno TEXT NULL,
  nota_admin TEXT NULL,
  resolved_at TIMESTAMP WITH TIME ZONE NULL,
  resolved_by UUID NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_waitlist_event ON public.event_accommodation_waitlist_requests(event_id);
CREATE INDEX idx_waitlist_package ON public.event_accommodation_waitlist_requests(package_id);
CREATE INDEX idx_waitlist_estado ON public.event_accommodation_waitlist_requests(estado);
CREATE INDEX idx_waitlist_alumno ON public.event_accommodation_waitlist_requests(alumno_id);

-- 2. GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_accommodation_waitlist_requests TO authenticated;
GRANT INSERT ON public.event_accommodation_waitlist_requests TO anon;
GRANT ALL ON public.event_accommodation_waitlist_requests TO service_role;

-- 3. ENABLE RLS
ALTER TABLE public.event_accommodation_waitlist_requests ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES
-- Cualquiera puede crear un pedido (guest + student + admin)
CREATE POLICY "Anyone can create waitlist request"
  ON public.event_accommodation_waitlist_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Admins/super-admins ven todo
CREATE POLICY "Admins view all waitlist requests"
  ON public.event_accommodation_waitlist_requests
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

-- Admins/super-admins actualizan
CREATE POLICY "Admins update waitlist requests"
  ON public.event_accommodation_waitlist_requests
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

-- Alumnos ven sus propios pedidos
CREATE POLICY "Alumnos view own waitlist requests"
  ON public.event_accommodation_waitlist_requests
  FOR SELECT
  TO authenticated
  USING (
    alumno_id IN (SELECT id FROM public.alumnos WHERE email = auth.email())
  );

-- 5. TRIGGER updated_at
CREATE TRIGGER update_waitlist_requests_updated_at
  BEFORE UPDATE ON public.event_accommodation_waitlist_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. RPC público para contar pendientes (para el badge admin sin traer filas)
CREATE OR REPLACE FUNCTION public.count_pending_waitlist_requests()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.event_accommodation_waitlist_requests
  WHERE estado = 'pendiente'
    AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));
$$;

GRANT EXECUTE ON FUNCTION public.count_pending_waitlist_requests() TO authenticated;

-- 7. RPC para confirmar cupo aumentando/creando una event_room
CREATE OR REPLACE FUNCTION public.confirm_waitlist_request(
  p_request_id uuid,
  p_room_id uuid,           -- si se pasa, se aumenta capacidad de esa habitación
  p_new_room_nombre text,   -- si p_room_id es NULL, se crea una nueva room
  p_new_room_tipo text,
  p_new_room_genero text,
  p_new_room_capacidad integer,
  p_nota_admin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_room_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_req
  FROM public.event_accommodation_waitlist_requests
  WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;

  IF p_room_id IS NOT NULL THEN
    UPDATE public.event_rooms
      SET capacidad = capacidad + GREATEST(COALESCE(p_new_room_capacidad, 1), 1),
          updated_at = now()
      WHERE id = p_room_id AND package_id = v_req.package_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'room_not_in_package'; END IF;
    v_room_id := p_room_id;
  ELSE
    INSERT INTO public.event_rooms (event_id, package_id, nombre, capacidad, genero, tipo)
    VALUES (
      v_req.event_id,
      v_req.package_id,
      COALESCE(NULLIF(p_new_room_nombre, ''), 'Nueva habitación (waitlist)'),
      GREATEST(COALESCE(p_new_room_capacidad, 1), 1),
      COALESCE(NULLIF(p_new_room_genero, ''), COALESCE(v_req.genero_preferido, 'mixta')),
      COALESCE(NULLIF(p_new_room_tipo, ''), 'otro')
    )
    RETURNING id INTO v_room_id;
  END IF;

  UPDATE public.event_accommodation_waitlist_requests
    SET estado = 'confirmado',
        nota_admin = COALESCE(NULLIF(p_nota_admin, ''), nota_admin),
        resolved_at = now(),
        resolved_by = auth.uid()
    WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'room_id', v_room_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_waitlist_request(uuid, uuid, text, text, text, integer, text) TO authenticated;