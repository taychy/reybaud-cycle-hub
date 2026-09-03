
-- =========================================================
-- Playbook: bloque "Clases del programa"
-- Relación mínima aditiva Playbook <-> Agenda (nullable).
-- Agenda sigue siendo fuente oficial de fecha/hora/sede/profesor.
-- Liquidaciones sigue siendo fuente oficial de honorarios/estado.
-- =========================================================

CREATE TABLE public.programa_clases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.planes(id) ON DELETE CASCADE,
  orden int NOT NULL,
  titulo text NOT NULL,
  duracion_min int NOT NULL DEFAULT 90,
  agenda_grupal_id uuid NULL REFERENCES public.agenda_grupal(id) ON DELETE SET NULL,
  agenda_fecha date NULL,
  admin_estado text NOT NULL DEFAULT 'pendiente'
    CHECK (admin_estado IN ('pendiente','aprobada','observada')),
  admin_nota text NULL,
  excepcion_nota text NULL,
  admin_actor uuid NULL,
  admin_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, orden)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programa_clases TO authenticated;
GRANT ALL ON public.programa_clases TO service_role;
ALTER TABLE public.programa_clases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gestionan programa_clases" ON public.programa_clases
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.programa_clase_docentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clase_id uuid NOT NULL REFERENCES public.programa_clases(id) ON DELETE CASCADE,
  nombre_planificado text NOT NULL,
  coach_id uuid NULL REFERENCES public.coaches(id) ON DELETE SET NULL,
  confirmacion text NOT NULL DEFAULT 'pendiente'
    CHECK (confirmacion IN ('pendiente','confirmado','no_puede')),
  motivo text NULL,
  confirmado_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programa_clase_docentes TO authenticated;
GRANT ALL ON public.programa_clase_docentes TO service_role;
ALTER TABLE public.programa_clase_docentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gestionan docentes de programa" ON public.programa_clase_docentes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coaches ven sus clases de programa" ON public.programa_clase_docentes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coaches c
                 WHERE c.id = programa_clase_docentes.coach_id AND c.user_id = auth.uid()));

CREATE POLICY "Coaches ven clases de programa (cabecera)" ON public.programa_clases
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.programa_clase_docentes d
                 JOIN public.coaches c ON c.id = d.coach_id
                 WHERE d.clase_id = programa_clases.id AND c.user_id = auth.uid()));

CREATE TABLE public.programa_clase_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clase_id uuid NOT NULL REFERENCES public.programa_clases(id) ON DELETE CASCADE,
  docente_id uuid NULL REFERENCES public.programa_clase_docentes(id) ON DELETE SET NULL,
  accion text NOT NULL,
  detalle text NULL,
  actor_user_id uuid NULL,
  actor_nombre text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.programa_clase_historial TO authenticated;
GRANT ALL ON public.programa_clase_historial TO service_role;
ALTER TABLE public.programa_clase_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins ven historial de clases de programa" ON public.programa_clase_historial
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coaches ven historial de sus clases" ON public.programa_clase_historial
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.programa_clase_docentes d
                 JOIN public.coaches c ON c.id = d.coach_id
                 WHERE d.clase_id = programa_clase_historial.clase_id AND c.user_id = auth.uid()));

CREATE TRIGGER trg_programa_clases_updated
  BEFORE UPDATE ON public.programa_clases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_programa_clase_docentes_updated
  BEFORE UPDATE ON public.programa_clase_docentes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_programa_clases_plan ON public.programa_clases(plan_id, orden);
CREATE INDEX idx_programa_clase_docentes_clase ON public.programa_clase_docentes(clase_id);
CREATE INDEX idx_programa_clase_docentes_coach ON public.programa_clase_docentes(coach_id);

-- =========================================================
-- Vista de estado: sólo LEE de Agenda / clases_dictadas / liquidación
-- =========================================================
CREATE VIEW public.vw_programa_clases_estado
WITH (security_invoker = true) AS
SELECT
  pc.id,
  pc.plan_id,
  pc.orden,
  pc.titulo,
  pc.duracion_min,
  pc.agenda_grupal_id,
  pc.agenda_fecha,
  pc.admin_estado,
  pc.admin_nota,
  pc.excepcion_nota,
  ag.dia_semana        AS agenda_dia_semana,
  ag.hora_inicio       AS agenda_hora_inicio,
  ag.hora_fin          AS agenda_hora_fin,
  ag.tipo_clase        AS agenda_tipo_clase,
  ag.fecha             AS agenda_fecha_puntual,
  ag.activo            AS agenda_activo,
  ag.grupo             AS agenda_grupo,
  s.nombre             AS agenda_sede,
  cr.id                AS agenda_coach_id,
  cr.nombre            AS agenda_coach_nombre,
  cd.id                AS clase_dictada_id,
  cd.fecha             AS clase_dictada_fecha,
  ml.estado_economico  AS liquidacion_estado,
  ml.liquidacion_mensual_id
FROM public.programa_clases pc
LEFT JOIN public.agenda_grupal ag ON ag.id = pc.agenda_grupal_id
LEFT JOIN public.sedes s ON s.id = ag.sede_id
LEFT JOIN public.coaches cr ON cr.id = ag.coach_id
LEFT JOIN LATERAL (
  SELECT c.* FROM public.clases_dictadas c
  WHERE c.agenda_id = pc.agenda_grupal_id
    AND (pc.agenda_fecha IS NULL OR c.fecha = pc.agenda_fecha)
  ORDER BY c.fecha DESC LIMIT 1
) cd ON true
LEFT JOIN public.movimientos_liquidacion ml ON ml.id = cd.movimiento_id;

GRANT SELECT ON public.vw_programa_clases_estado TO authenticated;
GRANT SELECT ON public.vw_programa_clases_estado TO service_role;

-- =========================================================
-- Funciones
-- =========================================================
CREATE OR REPLACE FUNCTION public.programa_clase_vincular_agenda(
  p_clase_id uuid,
  p_agenda_id uuid,
  p_fecha date DEFAULT NULL,
  p_nota text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Sólo un administrador puede vincular clases con la Agenda';
  END IF;
  IF p_agenda_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agenda_grupal WHERE id = p_agenda_id) THEN
    RAISE EXCEPTION 'La clase de Agenda no existe';
  END IF;

  UPDATE programa_clases
     SET agenda_grupal_id = p_agenda_id,
         agenda_fecha = p_fecha
   WHERE id = p_clase_id;

  INSERT INTO programa_clase_historial (clase_id, accion, detalle, actor_user_id)
  VALUES (p_clase_id,
          CASE WHEN p_agenda_id IS NULL THEN 'agenda_desvinculada' ELSE 'agenda_vinculada' END,
          p_nota, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.programa_clase_vincular_agenda(uuid, uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.programa_clase_vincular_agenda(uuid, uuid, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.programa_clase_confirmar_docente(
  p_docente_id uuid,
  p_confirmacion text,
  p_motivo text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row programa_clase_docentes%ROWTYPE;
  v_is_admin boolean := has_role(auth.uid(), 'admin'::app_role);
  v_owner boolean;
BEGIN
  IF p_confirmacion NOT IN ('pendiente','confirmado','no_puede') THEN
    RAISE EXCEPTION 'Confirmación inválida';
  END IF;
  SELECT * INTO v_row FROM programa_clase_docentes WHERE id = p_docente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Docente de clase no encontrado'; END IF;

  SELECT EXISTS (SELECT 1 FROM coaches c WHERE c.id = v_row.coach_id AND c.user_id = auth.uid())
    INTO v_owner;
  IF NOT v_is_admin AND NOT v_owner THEN
    RAISE EXCEPTION 'Sólo el profesor asignado puede confirmar su participación';
  END IF;

  UPDATE programa_clase_docentes
     SET confirmacion = p_confirmacion,
         motivo = p_motivo,
         confirmado_at = CASE WHEN p_confirmacion = 'pendiente' THEN NULL ELSE now() END
   WHERE id = p_docente_id;

  INSERT INTO programa_clase_historial (clase_id, docente_id, accion, detalle, actor_user_id, actor_nombre)
  VALUES (v_row.clase_id, p_docente_id, 'docente_' || p_confirmacion, p_motivo, auth.uid(), v_row.nombre_planificado);
END;
$$;

REVOKE ALL ON FUNCTION public.programa_clase_confirmar_docente(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.programa_clase_confirmar_docente(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.programa_clase_set_admin_estado(
  p_clase_id uuid,
  p_estado text,
  p_nota text DEFAULT NULL,
  p_excepcion_nota text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Sólo un administrador puede aprobar u observar una clase';
  END IF;
  IF p_estado NOT IN ('pendiente','aprobada','observada') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;

  UPDATE programa_clases
     SET admin_estado = p_estado,
         admin_nota = p_nota,
         excepcion_nota = COALESCE(p_excepcion_nota, excepcion_nota),
         admin_actor = auth.uid(),
         admin_at = now()
   WHERE id = p_clase_id;

  INSERT INTO programa_clase_historial (clase_id, accion, detalle, actor_user_id)
  VALUES (p_clase_id, 'admin_' || p_estado, COALESCE(p_nota, p_excepcion_nota), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.programa_clase_set_admin_estado(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.programa_clase_set_admin_estado(uuid, text, text, text) TO authenticated;

-- =========================================================
-- Seed: 8 clases del Programa Iniciación 2026/2
-- =========================================================
DO $seed$
DECLARE
  v_plan uuid := 'c1e21518-5bc0-47a7-9342-eee8fa6a9854';
  v_clase uuid;
  r record;
  d text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM planes WHERE id = v_plan) THEN RETURN; END IF;

  FOR r IN
    SELECT * FROM (VALUES
      (1, 'Diagnóstica y Base Técnica',      ARRAY['Claudio','Scarlett','Daniela']),
      (2, 'Destrezas Básicas y Cadencia',    ARRAY['Daniela']),
      (3, 'Introducción al Pelotón',         ARRAY['Chapu']),
      (4, 'Técnica de Relevos',              ARRAY['Chapu']),
      (5, 'Pararse en los Pedales',          ARRAY['Claudio']),
      (6, 'Base Física Aplicada',            ARRAY['Claudio','Daniela']),
      (7, 'Autonomía del Ciclista',          ARRAY['Daniela']),
      (8, 'Integración y Evaluación Final',  ARRAY['Por confirmar'])
    ) AS t(orden, titulo, docentes)
  LOOP
    INSERT INTO programa_clases (plan_id, orden, titulo, duracion_min)
    VALUES (v_plan, r.orden, r.titulo, 90)
    ON CONFLICT (plan_id, orden) DO NOTHING
    RETURNING id INTO v_clase;

    IF v_clase IS NULL THEN CONTINUE; END IF;

    FOREACH d IN ARRAY r.docentes LOOP
      INSERT INTO programa_clase_docentes (clase_id, nombre_planificado, coach_id)
      VALUES (
        v_clase,
        d,
        (SELECT c.id FROM coaches c
          WHERE c.estado = 'activo' AND lower(c.nombre) = lower(d)
          LIMIT 1)
      );
    END LOOP;
  END LOOP;
END;
$seed$;
