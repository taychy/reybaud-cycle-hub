
CREATE TABLE public.clases_dictadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  agenda_id UUID REFERENCES public.agenda_grupal(id) ON DELETE SET NULL,
  movimiento_id UUID REFERENCES public.movimientos_liquidacion(id) ON DELETE SET NULL,
  sede_id UUID REFERENCES public.sedes(id) ON DELETE SET NULL,
  honorario_id UUID REFERENCES public.honorarios(id) ON DELETE SET NULL,
  fecha DATE NOT NULL,
  hora_inicio TIME,
  hora_fin TIME,
  foto_grupal_url TEXT,
  notas TEXT,
  asistencia_cargada BOOLEAN NOT NULL DEFAULT false,
  cantidad_asistentes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clases_dictadas_coach_fecha ON public.clases_dictadas(coach_id, fecha DESC);
CREATE INDEX idx_clases_dictadas_sede_fecha ON public.clases_dictadas(sede_id, fecha DESC);
CREATE INDEX idx_clases_dictadas_agenda ON public.clases_dictadas(agenda_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clases_dictadas TO authenticated;
GRANT ALL ON public.clases_dictadas TO service_role;

ALTER TABLE public.clases_dictadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches see own clases dictadas"
ON public.clases_dictadas FOR SELECT TO authenticated
USING (
  coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Coaches insert own clases dictadas"
ON public.clases_dictadas FOR INSERT TO authenticated
WITH CHECK (
  coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Coaches update own clases dictadas"
ON public.clases_dictadas FOR UPDATE TO authenticated
USING (
  coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins delete clases dictadas"
ON public.clases_dictadas FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_clases_dictadas_updated_at
BEFORE UPDATE ON public.clases_dictadas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.redes_sociales_tareas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'publicar_foto_grupal',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  clase_dictada_id UUID REFERENCES public.clases_dictadas(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
  sede_id UUID REFERENCES public.sedes(id) ON DELETE SET NULL,
  fecha_clase DATE,
  foto_url TEXT,
  notas TEXT,
  red_social TEXT,
  publicado_at TIMESTAMPTZ,
  publicado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  link_publicacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_redes_tareas_estado ON public.redes_sociales_tareas(estado, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.redes_sociales_tareas TO authenticated;
GRANT ALL ON public.redes_sociales_tareas TO service_role;

ALTER TABLE public.redes_sociales_tareas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage redes tareas"
ON public.redes_sociales_tareas FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches create redes tareas"
ON public.redes_sociales_tareas FOR INSERT TO authenticated
WITH CHECK (
  coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid())
);

CREATE TRIGGER update_redes_sociales_tareas_updated_at
BEFORE UPDATE ON public.redes_sociales_tareas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.fn_generar_tarea_redes_foto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.foto_grupal_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.foto_grupal_url IS DISTINCT FROM NEW.foto_grupal_url) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.redes_sociales_tareas
      WHERE clase_dictada_id = NEW.id
        AND foto_url = NEW.foto_grupal_url
        AND estado = 'pendiente'
    ) THEN
      INSERT INTO public.redes_sociales_tareas (
        tipo, estado, clase_dictada_id, coach_id, sede_id, fecha_clase, foto_url, notas
      ) VALUES (
        'publicar_foto_grupal', 'pendiente', NEW.id, NEW.coach_id, NEW.sede_id, NEW.fecha, NEW.foto_grupal_url, NEW.notas
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clases_dictadas_redes_foto
AFTER INSERT OR UPDATE OF foto_grupal_url ON public.clases_dictadas
FOR EACH ROW EXECUTE FUNCTION public.fn_generar_tarea_redes_foto();

INSERT INTO public.honorarios (nombre_concepto, categoria, valor, vigencia_desde, activo)
VALUES
  ('Grupal 1h30 Maximales/Barrancas', 'clase', 18150, CURRENT_DATE, true),
  ('Pista 2hs', 'clase', 24200, CURRENT_DATE, true);
