-- 1) Elegibilidad de reingreso
CREATE OR REPLACE FUNCTION public.get_reingreso_status(p_alumno_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_alumno RECORD;
  v_deudas jsonb;
  v_total numeric := 0;
  v_email text;
BEGIN
  SELECT id, nombre, apellido, email, estado, grupo, user_id
    INTO v_alumno
  FROM public.alumnos WHERE id = p_alumno_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_email := lower(coalesce(auth.email(), ''));

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
    OR (v_alumno.user_id IS NOT NULL AND v_alumno.user_id = auth.uid())
    OR (v_email <> '' AND lower(coalesce(v_alumno.email,'')) = v_email)
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('moneda', moneda, 'monto', total)), '[]'::jsonb),
         coalesce(sum(CASE WHEN moneda = 'ARS' THEN total ELSE 0 END), 0)
    INTO v_deudas, v_total
  FROM (
    SELECT moneda, sum(por_pagar)::numeric AS total
    FROM public.get_cuenta_publica_deudas_raw(p_alumno_id)
    GROUP BY moneda
    HAVING sum(por_pagar) > 0.01
  ) d;

  RETURN jsonb_build_object(
    'found', true,
    'alumno_id', v_alumno.id,
    'nombre', trim(coalesce(v_alumno.nombre,'') || ' ' || coalesce(v_alumno.apellido,'')),
    'estado', v_alumno.estado,
    'grupo', v_alumno.grupo,
    'deudas', v_deudas,
    'deuda_ars', v_total,
    'tiene_deuda', (jsonb_array_length(v_deudas) > 0),
    'puede_reingresar', (jsonb_array_length(v_deudas) = 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reingreso_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reingreso_status(uuid) TO service_role;

-- 2) Aviso automático de reingreso
CREATE OR REPLACE FUNCTION public.tg_notify_alumno_reingreso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nombre text;
BEGIN
  IF OLD.estado = 'inactivo' AND NEW.estado = 'activo' THEN
    v_nombre := trim(coalesce(NEW.nombre,'') || ' ' || coalesce(NEW.apellido,''));

    INSERT INTO public.tareas (
      tipo, origen, titulo, descripcion, rol_destino, entidad_tipo, entidad_id,
      prioridad, estado, dedupe_key, metadata
    ) VALUES (
      'automatica', 'reingreso_alumno',
      'Reingreso: ' || v_nombre,
      v_nombre || ' volvió a la escuela por autogestión. Revisá grupo, sede y plan contratado.',
      'admin', 'alumno', NEW.id::text,
      'alta', 'pendiente',
      'reingreso_' || NEW.id::text || '_' || to_char(now(), 'YYYY-MM-DD'),
      jsonb_build_object('alumno_id', NEW.id, 'email', NEW.email, 'grupo', NEW.grupo)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

    INSERT INTO public.student_activity_log (
      alumno_id, event_type, title, description, actor_role, reference_type, reference_id
    ) VALUES (
      NEW.id, 'reingreso', 'Reingreso del alumno',
      'El alumno estaba inactivo y volvió a quedar activo.',
      'sistema', 'alumno', NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_alumno_reingreso ON public.alumnos;
CREATE TRIGGER trg_notify_alumno_reingreso
AFTER UPDATE OF estado ON public.alumnos
FOR EACH ROW
WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
EXECUTE FUNCTION public.tg_notify_alumno_reingreso();