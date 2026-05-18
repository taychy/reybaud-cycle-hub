-- 1. Agregar fechas a descuentos_alumno
ALTER TABLE public.descuentos_alumno
  ADD COLUMN IF NOT EXISTS fecha_inicio date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS fecha_fin date;

-- 2. Función para expirar descuentos vencidos y notificar al admin
CREATE OR REPLACE FUNCTION public.expire_descuentos_alumno()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  -- Desactivar vencidos
  FOR r IN
    SELECT da.id, da.alumno_id, d.nombre AS descuento_nombre,
           a.nombre AS alumno_nombre, a.apellido AS alumno_apellido,
           da.fecha_fin
    FROM public.descuentos_alumno da
    JOIN public.descuentos d ON d.id = da.descuento_id
    JOIN public.alumnos a ON a.id = da.alumno_id
    WHERE da.activo = true
      AND da.fecha_fin IS NOT NULL
      AND da.fecha_fin < CURRENT_DATE
  LOOP
    UPDATE public.descuentos_alumno
    SET activo = false, updated_at = now()
    WHERE id = r.id;

    INSERT INTO public.tareas (
      tipo, origen, titulo, descripcion, rol_destino, prioridad,
      entidad_tipo, entidad_id, dedupe_key, metadata
    ) VALUES (
      'automatica', 'descuento_vencido',
      'Descuento vencido: ' || r.alumno_nombre || ' ' || COALESCE(r.alumno_apellido,''),
      'El descuento "' || r.descuento_nombre || '" venció el ' || r.fecha_fin ||
        ' y fue desactivado automáticamente. Revisar si corresponde renovarlo o dejarlo cerrado.',
      'admin', 'media',
      'alumno', r.alumno_id::text,
      'descuento_vencido:' || r.id::text,
      jsonb_build_object('descuento_alumno_id', r.id, 'alumno_id', r.alumno_id, 'fecha_fin', r.fecha_fin)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;