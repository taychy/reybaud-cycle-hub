
-- Eliminar la reserva duplicada (la segunda, creada a las 19:20)
DELETE FROM public.reservas_turnera
 WHERE id = 'fb4e9f8c-d051-4e53-b142-b67f3b4c56f0';

-- #2 — Índice único parcial para bloquear doble booking del mismo slot
CREATE UNIQUE INDEX IF NOT EXISTS ux_reservas_turnera_slot_activo
  ON public.reservas_turnera (coach_id, fecha, hora_inicio)
  WHERE estado_operativo IN ('reservada', 'realizada');

-- #5 — tipo_actividad como campo del servicio
ALTER TABLE public.servicios_turnera
  ADD COLUMN IF NOT EXISTS tipo_actividad text NOT NULL DEFAULT 'personalizada';

UPDATE public.servicios_turnera
   SET tipo_actividad = 'evaluatoria'
 WHERE slug = 'evaluatoria';
