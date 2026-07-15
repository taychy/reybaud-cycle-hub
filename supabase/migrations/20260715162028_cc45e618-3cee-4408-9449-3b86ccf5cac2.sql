
CREATE TABLE public.event_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.event_packages(id) ON DELETE SET NULL,
  nombre text NOT NULL,
  capacidad integer NOT NULL DEFAULT 1 CHECK (capacidad > 0),
  genero text CHECK (genero IN ('mujeres','varones','mixto')),
  notas text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_rooms_event_idx ON public.event_rooms(event_id);
CREATE INDEX event_rooms_package_idx ON public.event_rooms(package_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_rooms TO authenticated;
GRANT ALL ON public.event_rooms TO service_role;

ALTER TABLE public.event_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage event_rooms"
  ON public.event_rooms FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_event_rooms_updated_at
  BEFORE UPDATE ON public.event_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.event_room_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.event_rooms(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id)
);
CREATE INDEX event_room_assignments_room_idx ON public.event_room_assignments(room_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_room_assignments TO authenticated;
GRANT ALL ON public.event_room_assignments TO service_role;

ALTER TABLE public.event_room_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage room assignments"
  ON public.event_room_assignments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Alumno views own assignment"
  ON public.event_room_assignments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_reservations er
    JOIN public.alumnos a ON a.id = er.alumno_id
    WHERE er.id = event_room_assignments.reservation_id
      AND a.email = auth.email()
  ));

CREATE POLICY "Alumnos view rooms via own reservation assignment"
  ON public.event_rooms FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_room_assignments era
    JOIN public.event_reservations er ON er.id = era.reservation_id
    JOIN public.alumnos a ON a.id = er.alumno_id
    WHERE era.room_id = event_rooms.id
      AND a.email = auth.email()
  ));

CREATE TRIGGER trg_event_room_assignments_updated_at
  BEFORE UPDATE ON public.event_room_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
