
-- ============================================================
-- 1. ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.gasto_ambito AS ENUM ('personal','emprendimiento','mixto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.gasto_frecuencia AS ENUM ('mensual','bimestral','trimestral','semestral','anual','variable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.gasto_ejecucion_estado AS ENUM ('pendiente','pagado','vencido','omitido','parcial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. CATALOGO DE GASTOS RECURRENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gastos_recurrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto text NOT NULL,
  categoria text NOT NULL,
  ambito public.gasto_ambito NOT NULL DEFAULT 'emprendimiento',
  responsable text,
  monto_estimado numeric NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'ARS',
  frecuencia public.gasto_frecuencia NOT NULL DEFAULT 'mensual',
  dia_vencimiento integer CHECK (dia_vencimiento BETWEEN 1 AND 31),
  meses_aplicables integer[],
  forma_pago_default text DEFAULT 'transferencia',
  proveedor text,
  notas text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gastos_recurrentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manage gastos_recurrentes"
  ON public.gastos_recurrentes FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_gastos_recurrentes_updated
  BEFORE UPDATE ON public.gastos_recurrentes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_gastos_rec_activo ON public.gastos_recurrentes(activo);
CREATE INDEX IF NOT EXISTS idx_gastos_rec_ambito ON public.gastos_recurrentes(ambito);

-- ============================================================
-- 3. EJECUCIONES MENSUALES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gastos_ejecuciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurrente_id uuid REFERENCES public.gastos_recurrentes(id) ON DELETE CASCADE,
  mes text NOT NULL,
  fecha_vencimiento date,
  monto_previsto numeric NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'ARS',
  estado public.gasto_ejecucion_estado NOT NULL DEFAULT 'pendiente',
  monto_pagado numeric DEFAULT 0,
  fecha_pago date,
  forma_pago text,
  gasto_id uuid REFERENCES public.gastos(id) ON DELETE SET NULL,
  notas text,
  pagado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recurrente_id, mes)
);

ALTER TABLE public.gastos_ejecuciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manage gastos_ejecuciones"
  ON public.gastos_ejecuciones FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_gastos_ejec_updated
  BEFORE UPDATE ON public.gastos_ejecuciones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_gastos_ejec_mes ON public.gastos_ejecuciones(mes);
CREATE INDEX IF NOT EXISTS idx_gastos_ejec_estado ON public.gastos_ejecuciones(estado);
CREATE INDEX IF NOT EXISTS idx_gastos_ejec_venc ON public.gastos_ejecuciones(fecha_vencimiento);

-- ============================================================
-- 4. RPC: generar ejecuciones de un mes
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_gastos_ejecuciones_month(p_mes text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_year int;
  v_month int;
  v_last_day int;
  v_dia int;
  v_fecha date;
  r record;
BEGIN
  v_year := split_part(p_mes,'-',1)::int;
  v_month := split_part(p_mes,'-',2)::int;
  v_last_day := EXTRACT(day FROM (make_date(v_year, v_month, 1) + interval '1 month - 1 day'))::int;

  FOR r IN
    SELECT * FROM public.gastos_recurrentes
    WHERE activo = true
      AND (
        frecuencia = 'mensual'
        OR (frecuencia = 'bimestral' AND v_month % 2 = 0)
        OR (frecuencia = 'trimestral' AND v_month % 3 = 0)
        OR (frecuencia = 'semestral' AND v_month % 6 = 0)
        OR (frecuencia = 'anual' AND v_month = 1)
        OR (meses_aplicables IS NOT NULL AND v_month = ANY(meses_aplicables))
        OR frecuencia = 'variable'
      )
  LOOP
    v_dia := LEAST(COALESCE(r.dia_vencimiento, 10), v_last_day);
    v_fecha := make_date(v_year, v_month, v_dia);

    INSERT INTO public.gastos_ejecuciones (
      recurrente_id, mes, fecha_vencimiento, monto_previsto, moneda, estado
    ) VALUES (
      r.id, p_mes, v_fecha, r.monto_estimado, r.moneda, 'pendiente'
    )
    ON CONFLICT (recurrente_id, mes) DO NOTHING;

    IF FOUND THEN v_inserted := v_inserted + 1; END IF;
  END LOOP;

  -- Marcar vencidas
  UPDATE public.gastos_ejecuciones
  SET estado = 'vencido', updated_at = now()
  WHERE mes = p_mes
    AND estado = 'pendiente'
    AND fecha_vencimiento < CURRENT_DATE;

  RETURN v_inserted;
END;
$$;

-- ============================================================
-- 5. RPC: marcar ejecución como pagada (e inserta en gastos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.pay_gasto_ejecucion(
  p_id uuid,
  p_monto numeric,
  p_fecha date,
  p_forma_pago text,
  p_notas text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ejec record;
  v_rec record;
  v_gasto_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede registrar pagos';
  END IF;

  SELECT * INTO v_ejec FROM public.gastos_ejecuciones WHERE id = p_id;
  IF v_ejec IS NULL THEN RAISE EXCEPTION 'Ejecución no encontrada'; END IF;

  SELECT * INTO v_rec FROM public.gastos_recurrentes WHERE id = v_ejec.recurrente_id;

  -- Insertar en tabla gastos contable
  INSERT INTO public.gastos (
    categoria, subcategoria, descripcion, monto, moneda, fecha,
    recurrente, frecuencia, proveedor, notas, forma_pago
  ) VALUES (
    v_rec.categoria,
    v_rec.ambito::text,
    v_rec.concepto || ' (' || v_ejec.mes || ')',
    p_monto,
    v_ejec.moneda,
    p_fecha,
    true,
    v_rec.frecuencia::text,
    v_rec.proveedor,
    p_notas,
    p_forma_pago
  ) RETURNING id INTO v_gasto_id;

  UPDATE public.gastos_ejecuciones
  SET estado = 'pagado',
      monto_pagado = p_monto,
      fecha_pago = p_fecha,
      forma_pago = p_forma_pago,
      gasto_id = v_gasto_id,
      pagado_por = auth.uid(),
      notas = COALESCE(p_notas, notas),
      updated_at = now()
  WHERE id = p_id;

  RETURN v_gasto_id;
END;
$$;

-- ============================================================
-- 6. EXTENDER generate_tareas_automaticas con gastos
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_tareas_gastos_pendientes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_today date := CURRENT_DATE;
  r record;
BEGIN
  -- Marcar vencidas
  UPDATE public.gastos_ejecuciones
  SET estado = 'vencido', updated_at = now()
  WHERE estado = 'pendiente'
    AND fecha_vencimiento < v_today;

  -- Crear tareas para gastos vencidos o que vencen en 3 días
  FOR r IN
    SELECT e.id, e.mes, e.fecha_vencimiento, e.monto_previsto, e.moneda, e.estado,
           gr.concepto, gr.categoria, gr.ambito
    FROM public.gastos_ejecuciones e
    JOIN public.gastos_recurrentes gr ON gr.id = e.recurrente_id
    WHERE e.estado IN ('pendiente','vencido')
      AND e.fecha_vencimiento <= v_today + 3
  LOOP
    INSERT INTO public.tareas (
      tipo, origen, titulo, descripcion, rol_destino, prioridad,
      fecha_vencimiento, entidad_tipo, entidad_id, dedupe_key, metadata
    ) VALUES (
      'automatica',
      'gasto_por_pagar',
      'Pagar: ' || r.concepto || ' (' || r.mes || ')',
      'Gasto ' || r.ambito::text || ' / ' || r.categoria ||
        ' por $' || r.monto_previsto::text || ' ' || r.moneda ||
        '. Vence el ' || r.fecha_vencimiento || '.',
      'super_admin',
      CASE WHEN r.estado = 'vencido' THEN 'critica'::tarea_prioridad ELSE 'alta'::tarea_prioridad END,
      r.fecha_vencimiento,
      'gasto_ejecucion',
      r.id::text,
      'gasto_por_pagar:' || r.id::text,
      jsonb_build_object('ejecucion_id', r.id, 'mes', r.mes, 'monto', r.monto_previsto, 'ambito', r.ambito)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- Auto-resolver tareas cuyos gastos ya fueron pagados u omitidos
  UPDATE public.tareas t
     SET estado = 'hecha', cerrada_at = now(),
         nota_cierre = COALESCE(nota_cierre,'Gasto resuelto')
    FROM public.gastos_ejecuciones e
   WHERE t.estado IN ('pendiente','en_curso','pospuesta')
     AND t.origen = 'gasto_por_pagar'
     AND e.id::text = t.entidad_id
     AND e.estado IN ('pagado','omitido');

  RETURN v_count;
END;
$$;

-- Hook en generate_tareas_automaticas
CREATE OR REPLACE FUNCTION public.generate_tareas_automaticas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_today date := CURRENT_DATE;
  v_day integer := EXTRACT(DAY FROM CURRENT_DATE)::integer;
  v_month text := to_char(CURRENT_DATE, 'YYYY-MM');
  v_bucket15 integer := (v_today - DATE '2024-01-01') / 15;
  v_grupo text;
  r record;
BEGIN
  PERFORM public.auto_resolve_tareas_automaticas();
  -- Asegurar ejecuciones del mes actual y crear tareas de gastos pendientes
  PERFORM public.generate_gastos_ejecuciones_month(v_month);
  v_count := v_count + public.generate_tareas_gastos_pendientes();

  IF v_day BETWEEN 5 AND 7 OR v_day BETWEEN 15 AND 17 THEN
    FOR v_grupo IN SELECT DISTINCT grupo::text FROM public.alumnos WHERE estado = 'activo' LOOP
      INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, fecha_vencimiento, dedupe_key, metadata)
      VALUES ('automatica','whatsapp_check',
        'Chequear WhatsApp del grupo ' || v_grupo,
        'Validar que todos los alumnos activos del grupo ' || v_grupo || ' estén en el grupo de WhatsApp correspondiente.',
        'admin','alta',
        CASE WHEN v_day <= 7 THEN make_date(EXTRACT(YEAR FROM v_today)::int, EXTRACT(MONTH FROM v_today)::int, 7)
             ELSE make_date(EXTRACT(YEAR FROM v_today)::int, EXTRACT(MONTH FROM v_today)::int, 17) END,
        'whatsapp_check:' || v_grupo || ':' || v_month || ':' || (CASE WHEN v_day <= 7 THEN 'q1' ELSE 'q2' END),
        jsonb_build_object('grupo', v_grupo, 'mes', v_month))
      ON CONFLICT (dedupe_key) DO NOTHING;
      IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;
  END IF;

  FOR r IN SELECT a.id, a.nombre, a.apellido FROM public.alumnos a
    WHERE a.estado = 'activo' AND a.updated_at < (now() - interval '30 days') LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES ('automatica','alumno_inactivo_30d',
      'Contactar a ' || r.nombre || ' ' || COALESCE(r.apellido,''),
      'Alumno activo sin actividad ni actualizaciones hace más de 30 días. Riesgo de abandono.',
      'admin','alta','alumno', r.id::text,
      'alumno_inactivo_30d:' || r.id::text || ':' || v_month,
      jsonb_build_object('alumno_id', r.id))
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  FOR r IN SELECT c.id, c.user_id, c.nombre,
      (SELECT MAX(fecha) FROM public.feedback_coach WHERE coach_id = c.id) AS last_fb
    FROM public.coaches c WHERE c.estado = 'activo' LOOP
    IF r.last_fb IS NULL OR r.last_fb < (v_today - interval '14 days') THEN
      INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, asignado_user_id, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
      VALUES ('automatica','coach_sin_feedback_14d','Cargar feedback de alumnos',
        'Hace más de 14 días que no registrás feedback de tus alumnos. Cargá observaciones para mantener el seguimiento.',
        'coach', r.user_id,'media','coach', r.id::text,
        'coach_sin_feedback_14d:' || r.id::text || ':' || to_char(v_today,'IYYY-IW'),
        jsonb_build_object('coach_id', r.id, 'last_feedback', r.last_fb))
      ON CONFLICT (dedupe_key) DO NOTHING;
      IF FOUND THEN v_count := v_count + 1; END IF;
    END IF;
  END LOOP;

  FOR r IN SELECT id, nombre, apellido FROM public.alumnos
    WHERE estado = 'activo' AND COALESCE(medical_certificate_status,'no_cargado') = 'no_cargado' LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES ('automatica','certificado_no_cargado',
      'Solicitar certificado médico a ' || r.nombre || ' ' || COALESCE(r.apellido,''),
      'Alumno activo sin certificado médico cargado. Solicitar el apto y subirlo. Reaparece cada 15 días hasta cargarlo.',
      'admin','alta','alumno', r.id::text,
      'certificado_no_cargado:' || r.id::text || ':b' || v_bucket15,
      jsonb_build_object('alumno_id', r.id, 'bucket', v_bucket15))
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  FOR r IN SELECT id, nombre, apellido, medical_certificate_expiration_date FROM public.alumnos
    WHERE estado = 'activo' AND medical_certificate_expiration_date IS NOT NULL
      AND medical_certificate_expiration_date <= (v_today + interval '30 days') LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, fecha_vencimiento, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES ('automatica','certificado_por_vencer',
      'Certificado médico de ' || r.nombre || ' ' || COALESCE(r.apellido,''),
      CASE WHEN r.medical_certificate_expiration_date < v_today
           THEN 'Certificado VENCIDO el ' || r.medical_certificate_expiration_date || '. Solicitar renovación urgente.'
           ELSE 'Certificado vence el ' || r.medical_certificate_expiration_date || '. Recordar al alumno renovarlo.' END,
      'admin',
      CASE WHEN r.medical_certificate_expiration_date < v_today THEN 'critica'::tarea_prioridad ELSE 'media'::tarea_prioridad END,
      r.medical_certificate_expiration_date,'alumno', r.id::text,
      'certificado_por_vencer:' || r.id::text || ':' || r.medical_certificate_expiration_date,
      jsonb_build_object('alumno_id', r.id,'vence', r.medical_certificate_expiration_date))
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  FOR r IN SELECT s.id, s.alumno_id, a.nombre, a.apellido, s.updated_at FROM public.suscripciones s
    JOIN public.alumnos a ON a.id = s.alumno_id
    WHERE s.estado = 'pendiente_verificacion' AND s.updated_at < (now() - interval '48 hours') LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES ('automatica','pago_pendiente_validar',
      'Validar pago de ' || r.nombre || ' ' || COALESCE(r.apellido,''),
      'Hay un pago informado hace más de 48 horas que sigue pendiente de verificación. Revisar y validar.',
      'admin','alta','suscripcion', r.id::text,
      'pago_pendiente_validar:' || r.id::text || ':b' || v_bucket15,
      jsonb_build_object('suscripcion_id', r.id,'alumno_id', r.alumno_id,'bucket', v_bucket15))
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  FOR r IN SELECT s.id, s.alumno_id, a.nombre, a.apellido, s.estado, s.created_at FROM public.suscripciones s
    JOIN public.alumnos a ON a.id = s.alumno_id
    WHERE s.estado IN ('pendiente','pago_pendiente','pausa','acceso_pausado')
      AND s.cancelada_at IS NULL AND s.created_at < (now() - interval '24 hours') LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES ('automatica','suscripcion_pendiente_15d',
      'Revisar suscripción de ' || r.nombre || ' ' || COALESCE(r.apellido,'') || ' (' || r.estado || ')',
      'Suscripción en estado "' || r.estado || '" sin resolverse. Contactar al alumno para destrabar y dejar comentario. Reaparece en 15 días si no se resuelve.',
      'admin','alta','suscripcion', r.id::text,
      'suscripcion_pendiente_15d:' || r.id::text || ':b' || v_bucket15,
      jsonb_build_object('suscripcion_id', r.id,'alumno_id', r.alumno_id,'estado_sub', r.estado,'bucket', v_bucket15))
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  FOR r IN SELECT a.id AS alumno_id, a.nombre, a.apellido,
      (SELECT MAX(s2.fecha_fin) FROM public.suscripciones s2 WHERE s2.alumno_id = a.id AND s2.cancelada_at IS NULL) AS ultima_fin
    FROM public.alumnos a
    WHERE a.estado NOT IN ('inactivo','bloqueado')
      AND NOT EXISTS (SELECT 1 FROM public.suscripciones s
        WHERE s.alumno_id = a.id AND s.cancelada_at IS NULL
          AND ((s.estado = 'activa' AND (s.fecha_fin IS NULL OR s.fecha_fin >= v_today))
               OR s.estado IN ('pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','pausa'))) LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES ('automatica','suscripcion_vencida_sin_renovar',
      'Renovar plan de ' || r.nombre || ' ' || COALESCE(r.apellido,''),
      'Alumno sin suscripción vigente' ||
        CASE WHEN r.ultima_fin IS NOT NULL THEN ' (última venció el ' || r.ultima_fin || ')' ELSE '' END ||
        '. Confirmar si renueva o pasa a baja. Reaparece cada 15 días hasta resolver.',
      'admin','alta','alumno', r.alumno_id::text,
      'suscripcion_vencida_sin_renovar:' || r.alumno_id::text || ':b' || v_bucket15,
      jsonb_build_object('alumno_id', r.alumno_id,'ultima_fin', r.ultima_fin,'bucket', v_bucket15))
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  FOR r IN SELECT id, nombre, apellido, estado, pause_motivo, pause_fecha_estimada_retorno FROM public.alumnos
    WHERE estado NOT IN ('activo','inactivo','bloqueado') LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES ('automatica','alumno_estado_intermedio_15d',
      'Revisar caso de ' || r.nombre || ' ' || COALESCE(r.apellido,'') || ' (' || r.estado || ')',
      'Alumno en estado "' || r.estado || '"' ||
        CASE WHEN r.pause_motivo IS NOT NULL THEN '. Motivo: ' || r.pause_motivo ELSE '' END ||
        CASE WHEN r.pause_fecha_estimada_retorno IS NOT NULL THEN '. Retorno estimado: ' || r.pause_fecha_estimada_retorno ELSE '' END ||
        '. Definir si vuelve a activo o pasa a baja. Reaparece cada 15 días hasta resolver.',
      'admin','media','alumno', r.id::text,
      'alumno_estado_intermedio_15d:' || r.id::text || ':b' || v_bucket15,
      jsonb_build_object('alumno_id', r.id,'estado', r.estado,'bucket', v_bucket15))
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  FOR r IN SELECT s.id, s.alumno_id, a.nombre, a.apellido, s.fecha_fin FROM public.suscripciones s
    JOIN public.alumnos a ON a.id = s.alumno_id
    WHERE s.estado = 'activa' AND s.cancelada_at IS NULL
      AND s.fecha_fin BETWEEN v_today AND v_today + 7 LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, fecha_vencimiento, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES ('automatica','renovacion_proxima_7d',
      'Renovación próxima de ' || r.nombre || ' ' || COALESCE(r.apellido,''),
      'Suscripción vence el ' || r.fecha_fin || '. Coordinar renovación o confirmar continuidad.',
      'admin','media', r.fecha_fin,'suscripcion', r.id::text,
      'renovacion_proxima_7d:' || r.id::text || ':' || r.fecha_fin,
      jsonb_build_object('suscripcion_id', r.id,'alumno_id', r.alumno_id,'fecha_fin', r.fecha_fin))
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- ============================================================
-- 7. SEED: conceptos del Excel Gastos 2026
-- ============================================================
INSERT INTO public.gastos_recurrentes (concepto, categoria, ambito, responsable, monto_estimado, moneda, frecuencia, dia_vencimiento, forma_pago_default) VALUES
-- SUELDOS (todos emprendimiento)
('Natalia Fernandez','Sueldos','emprendimiento','Tay',800000,'ARS','mensual',5,'transferencia'),
('Scarlett Barros','Sueldos','emprendimiento','Tay',1365333,'ARS','mensual',5,'transferencia'),
('Medicus Scarlett y Martina','Sueldos','emprendimiento','Tay',448324,'ARS','mensual',10,'transferencia'),
('Claudio Reybaud','Sueldos','emprendimiento','Tay',1115750,'ARS','mensual',5,'transferencia'),
('Medicus Claudio','Sueldos','personal','Tay',329840,'ARS','mensual',10,'transferencia'),
('Ayelen Moya','Sueldos','emprendimiento','Tay',427917,'ARS','mensual',5,'transferencia'),
('Noelia Deposito','Sueldos','emprendimiento','Tay',182000,'ARS','mensual',5,'transferencia'),
-- VEHICULO
('Seguro camioneta Escuela','Vehiculo','emprendimiento','Clau',217345,'ARS','mensual',15,'transferencia'),
('Seguro camioneta Familia','Vehiculo','personal','Clau',142702,'ARS','mensual',15,'transferencia'),
('Patente camioneta Escuela','Vehiculo','emprendimiento','Clau',0,'ARS','bimestral',15,'transferencia'),
('Patente camioneta Familia','Vehiculo','personal','Clau',88753,'ARS','bimestral',15,'transferencia'),
('VTV','Vehiculo','mixto','Clau',53819,'ARS','anual',15,'efectivo'),
('Peajes y estacionamiento','Vehiculo','mixto','Clau',50000,'ARS','mensual',28,'tarjeta_credito'),
('Seguro del tráiler','Vehiculo','emprendimiento','Clau',17445,'ARS','mensual',15,'transferencia'),
('Combustible Claudio','Vehiculo','personal','Clau',165000,'ARS','mensual',28,'tarjeta_credito'),
('Mantenimiento vehiculos prorrateo mensual','Vehiculo','mixto','Clau',53651,'ARS','mensual',28,'efectivo'),
-- OFICINA
('Alquiler Oficina','Oficina','emprendimiento','Tay',900000,'ARS','mensual',5,'transferencia'),
('Limpieza Oficina','Oficina','emprendimiento','Tay',0,'ARS','mensual',10,'efectivo'),
('Edenor casas','Servicios','personal','Tay',200043,'ARS','mensual',20,'transferencia'),
('Edenor Garage','Servicios','emprendimiento','Tay',27888,'ARS','mensual',20,'transferencia'),
('Agua (Aysa)','Servicios','personal','Tay',125737,'ARS','mensual',25,'transferencia'),
('Material de impresión','Oficina','emprendimiento','Tay',0,'ARS','variable',null,'efectivo'),
('Celular Tay + Internet casa / escuela','Servicios','mixto','Tay',109719,'ARS','mensual',10,'transferencia'),
('Celular Clau','Servicios','personal','Clau',88527,'ARS','mensual',10,'transferencia'),
('Celular cobranzas/viajes (josi mp)','Servicios','emprendimiento','Tay',8000,'ARS','mensual',10,'transferencia'),
('Celular Escuela','Servicios','emprendimiento','Tay',82181,'ARS','mensual',10,'transferencia'),
('Memoria Google','Software','mixto','Tay',0,'USD','mensual',1,'tarjeta_credito'),
('Gsuit cuentas','Software','emprendimiento','Tay',93465,'ARS','mensual',1,'tarjeta_credito'),
('Gastos google','Software','emprendimiento','Tay',0,'ARS','mensual',1,'tarjeta_credito'),
('Training Peaks','Software','emprendimiento','Clau',0,'USD','mensual',1,'tarjeta_credito'),
('Strava','Software','personal','Clau',0,'USD','anual',1,'tarjeta_credito'),
('Microsoft','Software','emprendimiento','Tay',0,'USD','mensual',1,'tarjeta_credito'),
('Contador Valeria (Josi)','Honorarios','emprendimiento','Tay',96667,'ARS','mensual',15,'transferencia'),
('Contador Hernan (Claudio y Scarlett)','Honorarios','mixto','Tay',343333,'ARS','mensual',15,'transferencia'),
('Honorarios Josi','Honorarios','emprendimiento','Tay',75000,'ARS','mensual',5,'transferencia'),
('DUX','Software','emprendimiento','Tay',84500,'ARS','mensual',10,'tarjeta_credito'),
('Antivirus','Software','emprendimiento','Tay',0,'ARS','anual',1,'tarjeta_credito'),
('Monica Redes','Marketing','emprendimiento','Tay',150000,'ARS','mensual',10,'transferencia'),
('Fotos','Marketing','emprendimiento','Tay',0,'ARS','variable',null,'transferencia'),
('Wiroos SSL POSITIVO','Software','emprendimiento','Tay',0,'ARS','anual',1,'tarjeta_credito'),
('Wiroos DOMINIO','Software','emprendimiento','Tay',0,'ARS','anual',1,'tarjeta_credito'),
('Wiroos AVANZADO','Software','emprendimiento','Tay',0,'ARS','anual',1,'tarjeta_credito'),
('Naturgy','Servicios','personal','Tay',38319,'ARS','bimestral',20,'transferencia'),
-- SUELDOS VARIABLES
('Federico','Sueldos Variables','emprendimiento','Tay',288375,'ARS','mensual',5,'transferencia'),
('Daniela','Sueldos Variables','emprendimiento','Tay',199000,'ARS','mensual',5,'transferencia'),
('Carlos','Sueldos Variables','emprendimiento','Tay',102833,'ARS','mensual',5,'transferencia'),
('Jorge','Sueldos Variables','emprendimiento','Tay',543833,'ARS','mensual',5,'transferencia'),
-- EXTRAS
('Canje de indumentaria con influenciadores','Extras','emprendimiento','Tay',0,'ARS','variable',null,'efectivo'),
('Becados escuela','Extras','emprendimiento','Tay',0,'ARS','variable',null,'efectivo'),
('Regalos a familiares y amigos (indumentaria)','Extras','personal','Tay',0,'ARS','variable',null,'efectivo'),
('Indumentaria/Cósmeticos Staff','Extras','emprendimiento','Tay',0,'ARS','variable',null,'efectivo'),
('Materiales mantenimiento bicicletas staff','Extras','emprendimiento','Tay',0,'ARS','variable',null,'efectivo'),
-- MONOTRIBUTOS
('Monotributo Josi','Impuestos','emprendimiento','Tay',110873,'ARS','mensual',20,'transferencia'),
('Monotributo Scarlett','Impuestos','emprendimiento','Tay',259477,'ARS','mensual',20,'transferencia'),
('Monotributo Claudio','Impuestos','emprendimiento','Tay',91784,'ARS','mensual',20,'transferencia'),
-- INVERSIONES
('Web Julio','Inversiones','emprendimiento','Tay',460000,'ARS','variable',null,'transferencia'),
('Consultoria Herno anual','Inversiones','emprendimiento','Tay',3480000,'ARS','anual',1,'transferencia'),
-- TARJETAS / DEUDAS
('Visa BBVA','Tarjetas','mixto','Tay',200000,'ARS','mensual',10,'transferencia'),
-- IRUPE
('Colegio Irupe','Educacion','personal','Tay',540000,'ARS','mensual',10,'transferencia'),
('Matricula Irupe','Educacion','personal','Tay',540000,'ARS','anual',1,'transferencia')
ON CONFLICT DO NOTHING;
