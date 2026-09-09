CREATE OR REPLACE VIEW public.vw_mp_preapproval_movimientos AS
SELECT
  COALESCE(
    (m.raw -> 'metadata') ->> 'preapproval_id',
    ((m.raw -> 'point_of_interaction') -> 'transaction_data') ->> 'subscription_id'
  ) AS preapproval_id,
  m.id AS movimiento_id,
  m.mp_payment_id,
  m.fecha_movimiento,
  m.amount,
  m.currency,
  m.description,
  m.payer_email,
  m.status,
  m.status_detail,
  m.suscripcion_id,
  (m.suscripcion_id IS NOT NULL) AS imputado,
  m.alumno_id,
  m.assigned_manually,
  m.assigned_at
FROM public.mp_account_movements m
WHERE m.tipo = 'payment'
  AND m.status = 'approved'
  AND COALESCE(
    (m.raw -> 'metadata') ->> 'preapproval_id',
    ((m.raw -> 'point_of_interaction') -> 'transaction_data') ->> 'subscription_id'
  ) IS NOT NULL;

GRANT SELECT ON public.vw_mp_preapproval_movimientos TO authenticated;
GRANT SELECT ON public.vw_mp_preapproval_movimientos TO service_role;

DROP VIEW IF EXISTS public.vw_mp_preapprovals_admin;
CREATE VIEW public.vw_mp_preapprovals_admin AS
WITH movs AS (
  SELECT COALESCE((m.raw -> 'metadata') ->> 'preapproval_id',
                  ((m.raw -> 'point_of_interaction') -> 'transaction_data') ->> 'subscription_id') AS pa,
         count(*) AS movimientos,
         min(m.fecha_movimiento) AS primera_fecha,
         max(m.fecha_movimiento) AS ultima_fecha,
         count(*) FILTER (WHERE m.suscripcion_id IS NULL) AS movimientos_sin_imputar
  FROM public.mp_account_movements m
  WHERE m.tipo = 'payment' AND m.status = 'approved'
  GROUP BY 1
)
SELECT p.preapproval_id,
       p.mp_plan_id,
       p.cuenta_mp_id,
       p.payer_email,
       p.descripcion_mp,
       p.importe_referencia,
       p.moneda,
       p.estado,
       p.origen_alumno,
       p.notas,
       p.alumno_id,
       (a.nombre || ' ') || COALESCE(a.apellido, '') AS alumno_nombre,
       COALESCE(a.email, '') || ' ' || COALESCE(array_to_string(a.emails_adicionales, ' '), '') AS alumno_emails,
       p.plan_id,
       pl.nombre AS plan_nombre,
       p.confirmado_por,
       ap.email AS confirmado_por_email,
       p.confirmado_at,
       COALESCE(mv.movimientos, 0::bigint) AS movimientos_vistos,
       COALESCE(mv.movimientos_sin_imputar, 0::bigint) AS movimientos_sin_imputar,
       COALESCE(mv.primera_fecha, p.first_seen_at) AS primera_fecha,
       COALESCE(mv.ultima_fecha, p.last_seen_at) AS ultima_fecha,
       p.created_at,
       p.updated_at
FROM public.mp_preapprovals p
LEFT JOIN movs mv ON mv.pa = p.preapproval_id
LEFT JOIN public.alumnos a ON a.id = p.alumno_id
LEFT JOIN public.planes pl ON pl.id = p.plan_id
LEFT JOIN public.admin_profiles ap ON ap.user_id = p.confirmado_por;

GRANT SELECT ON public.vw_mp_preapprovals_admin TO authenticated;
GRANT SELECT ON public.vw_mp_preapprovals_admin TO service_role;

CREATE OR REPLACE FUNCTION public.buscar_alumnos_mp(_q text, _limit int DEFAULT 20)
RETURNS TABLE (id uuid, nombre text, apellido text, email text, emails_adicionales text[], estado text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.nombre, a.apellido, a.email, a.emails_adicionales, a.estado
  FROM public.alumnos a
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      COALESCE(_q, '') = ''
      OR (a.nombre || ' ' || COALESCE(a.apellido, '')) ILIKE '%' || _q || '%'
      OR COALESCE(a.email, '') ILIKE '%' || _q || '%'
      OR COALESCE(array_to_string(a.emails_adicionales, ' '), '') ILIKE '%' || _q || '%'
    )
  ORDER BY a.nombre, a.apellido
  LIMIT LEAST(COALESCE(_limit, 20), 50)
$$;

CREATE OR REPLACE FUNCTION public.set_mp_preapproval_mapping(
  _preapproval_id text,
  _estado text,
  _aplicar_mapping boolean DEFAULT false,
  _alumno_id uuid DEFAULT NULL,
  _plan_id uuid DEFAULT NULL,
  _notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev record;
  v_alumno uuid;
  v_plan uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF _estado NOT IN ('detectado','confirmado','ignorado') THEN
    RAISE EXCEPTION 'invalid_estado';
  END IF;

  SELECT * INTO v_prev FROM public.mp_preapprovals WHERE preapproval_id = _preapproval_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'preapproval_not_found'; END IF;

  IF _aplicar_mapping THEN
    v_alumno := _alumno_id;
    v_plan   := _plan_id;
  ELSE
    v_alumno := v_prev.alumno_id;
    v_plan   := v_prev.plan_id;
  END IF;

  IF _estado = 'confirmado' AND (v_alumno IS NULL OR v_plan IS NULL) THEN
    RAISE EXCEPTION 'alumno_y_plan_requeridos_para_confirmar';
  END IF;

  UPDATE public.mp_preapprovals SET
    alumno_id     = v_alumno,
    plan_id       = v_plan,
    origen_alumno = CASE
                      WHEN _aplicar_mapping AND v_alumno IS NOT NULL THEN 'confirmado_admin'
                      WHEN _aplicar_mapping AND v_alumno IS NULL THEN NULL
                      ELSE origen_alumno
                    END,
    estado        = _estado,
    notas         = COALESCE(_notas, notas),
    confirmado_por = CASE WHEN _estado = 'confirmado' THEN auth.uid()
                          WHEN _estado = 'detectado' THEN NULL
                          ELSE confirmado_por END,
    confirmado_at  = CASE WHEN _estado = 'confirmado' THEN now()
                          WHEN _estado = 'detectado' THEN NULL
                          ELSE confirmado_at END
  WHERE preapproval_id = _preapproval_id;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), auth.email(), 'admin', 'mp_preapproval_mapping', 'mp_preapprovals', _preapproval_id,
    jsonb_build_object(
      'antes', jsonb_build_object('alumno_id', v_prev.alumno_id, 'plan_id', v_prev.plan_id, 'estado', v_prev.estado),
      'despues', jsonb_build_object('alumno_id', v_alumno, 'plan_id', v_plan, 'estado', _estado),
      'aplico_mapping', _aplicar_mapping,
      'notas', _notas,
      'nota_alcance', 'Solo identidad recurrente. No imputa pagos ni modifica suscripciones.'
    )
  );

  RETURN jsonb_build_object('ok', true, 'preapproval_id', _preapproval_id, 'estado', _estado,
                            'alumno_id', v_alumno, 'plan_id', v_plan);
END;
$$;