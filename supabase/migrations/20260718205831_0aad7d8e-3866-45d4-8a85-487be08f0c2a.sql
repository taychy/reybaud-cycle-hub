
ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date,
  ADD COLUMN IF NOT EXISTS ultimo_saludo_cumple_year integer;

ALTER TABLE public.whatsapp_check_runs
  ADD COLUMN IF NOT EXISTS coaches_participantes uuid[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.create_tareas_from_whatsapp_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  extra RECORD;
  assignee uuid;
BEGIN
  IF NEW.estado <> 'cerrado' OR COALESCE(OLD.estado,'') = 'cerrado' THEN
    RETURN NEW;
  END IF;

  assignee := COALESCE(NEW.cerrado_por, NEW.admin_id);

  FOR item IN
    SELECT i.*
    FROM public.whatsapp_check_items i
    WHERE i.run_id = NEW.id
      AND (
        i.plan_inconsistente = true
        OR i.grupo_incorrecto = true
        OR COALESCE(i.resultado,'') NOT IN ('ok','confirmado','presente','')
      )
  LOOP
    INSERT INTO public.tareas (
      tipo, origen, titulo, descripcion, rol_destino, asignado_user_id,
      entidad_tipo, entidad_id, prioridad, estado, dedupe_key, metadata, created_by
    )
    VALUES (
      'automatica', 'whatsapp_check',
      'Revisar chequeo · ' || COALESCE(item.nombre_snapshot, 'alumno'),
      COALESCE(NULLIF(item.nota,''), 'Resultado: ' || COALESCE(item.resultado,'sin dato')),
      'coach', assignee,
      'alumno', item.alumno_id::text,
      'media', 'pendiente',
      'wa_check:' || NEW.id::text || ':' || item.id::text,
      jsonb_build_object('run_id', NEW.id, 'grupo', NEW.grupo, 'resultado', item.resultado, 'plan_inconsistente', item.plan_inconsistente, 'grupo_incorrecto', item.grupo_incorrecto),
      assignee
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END LOOP;

  FOR extra IN
    SELECT e.* FROM public.whatsapp_check_extras e WHERE e.run_id = NEW.id
  LOOP
    INSERT INTO public.tareas (
      tipo, origen, titulo, descripcion, rol_destino, asignado_user_id,
      entidad_tipo, entidad_id, prioridad, estado, dedupe_key, metadata, created_by
    )
    VALUES (
      'automatica', 'whatsapp_check',
      'Persona no esperada · ' || COALESCE(extra.nombre, extra.telefono, 'desconocido'),
      COALESCE(NULLIF(extra.nota,''), 'Motivo: ' || COALESCE(extra.motivo,'-')),
      'coach', assignee,
      'alumno', COALESCE(extra.alumno_id::text, ''),
      'media', 'pendiente',
      'wa_check_extra:' || NEW.id::text || ':' || extra.id::text,
      jsonb_build_object('run_id', NEW.id, 'grupo', NEW.grupo, 'motivo', extra.motivo, 'telefono', extra.telefono),
      assignee
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_check_run_cerrado ON public.whatsapp_check_runs;
CREATE TRIGGER trg_wa_check_run_cerrado
  AFTER UPDATE OF estado ON public.whatsapp_check_runs
  FOR EACH ROW EXECUTE FUNCTION public.create_tareas_from_whatsapp_check();

CREATE UNIQUE INDEX IF NOT EXISTS tareas_dedupe_key_uidx ON public.tareas(dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS alumnos_birthday_mmdd_idx
  ON public.alumnos ((extract(month from fecha_nacimiento)::int), (extract(day from fecha_nacimiento)::int))
  WHERE fecha_nacimiento IS NOT NULL;
