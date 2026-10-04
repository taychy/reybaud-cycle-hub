-- Clases puntuales de programas pueden quedar con "Profesor pendiente".
ALTER TABLE public.agenda_grupal ALTER COLUMN coach_id DROP NOT NULL;
ALTER TABLE public.agenda_grupal ADD CONSTRAINT agenda_grupal_coach_pendiente_solo_puntual_chk
  CHECK (coach_id IS NOT NULL OR tipo_clase = 'puntual');

-- Crea (idempotente) una clase puntual de Agenda por cada programa_clase sin vincular,
-- según el orden de clases y las fechas recibidas. No crea clases_dictadas ni liquidaciones.
CREATE OR REPLACE FUNCTION public.programa_sync_clases_agenda(
  p_plan_id uuid, p_sede_id uuid, p_hora_inicio time, p_hora_fin time, p_fechas date[], p_nota text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record; v_fecha date; v_ag uuid; v_grupo text; v_creadas int := 0; v_vinculadas int := 0; v_existentes int := 0; i int := 0;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sólo un administrador puede sincronizar clases con la Agenda';
  END IF;
  SELECT nombre INTO v_grupo FROM planes WHERE id = p_plan_id;
  IF v_grupo IS NULL THEN RAISE EXCEPTION 'Programa inexistente'; END IF;

  FOR r IN SELECT * FROM programa_clases WHERE plan_id = p_plan_id ORDER BY orden LOOP
    i := i + 1;
    EXIT WHEN i > COALESCE(array_length(p_fechas, 1), 0);
    IF r.agenda_grupal_id IS NOT NULL THEN v_existentes := v_existentes + 1; CONTINUE; END IF;
    v_fecha := p_fechas[i];
    SELECT id INTO v_ag FROM agenda_grupal
      WHERE tipo_clase = 'puntual' AND fecha = v_fecha AND hora_inicio = p_hora_inicio
        AND hora_fin = p_hora_fin AND sede_id IS NOT DISTINCT FROM p_sede_id AND grupo = v_grupo
      LIMIT 1;
    IF v_ag IS NULL THEN
      INSERT INTO agenda_grupal (coach_id, dia_semana, hora_inicio, hora_fin, grupo, sede_id, tipo_clase, fecha, notas)
      VALUES (NULL, EXTRACT(DOW FROM v_fecha)::smallint, p_hora_inicio, p_hora_fin, v_grupo, p_sede_id, 'puntual', v_fecha,
              'Clase ' || r.orden || ' · ' || r.titulo)
      RETURNING id INTO v_ag;
      v_creadas := v_creadas + 1;
    ELSE
      v_vinculadas := v_vinculadas + 1;
    END IF;
    UPDATE programa_clases SET agenda_grupal_id = v_ag, agenda_fecha = v_fecha WHERE id = r.id;
    INSERT INTO programa_clase_historial (clase_id, accion, detalle, actor_user_id)
    VALUES (r.id, 'agenda_vinculada', COALESCE(p_nota, 'Sincronización automática con Agenda'), auth.uid());
  END LOOP;
  RETURN jsonb_build_object('creadas', v_creadas, 'vinculadas_existentes', v_vinculadas, 'ya_vinculadas', v_existentes);
END;
$$;
REVOKE ALL ON FUNCTION public.programa_sync_clases_agenda(uuid, uuid, time, time, date[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.programa_sync_clases_agenda(uuid, uuid, time, time, date[], text) TO authenticated;