-- P0 conciliación recurrente MP: identidad preapproval → alumno → plan.
-- NO imputa pagos, NO toca suscripciones ni mp_account_movements.

CREATE TABLE IF NOT EXISTS public.mp_preapprovals (
  preapproval_id text PRIMARY KEY,
  mp_plan_id text,
  cuenta_mp_id uuid REFERENCES public.cuentas_mp(id) ON DELETE SET NULL,
  alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.planes(id) ON DELETE SET NULL,
  payer_email text,
  descripcion_mp text,
  importe_referencia numeric,
  moneda text DEFAULT 'ARS',
  estado text NOT NULL DEFAULT 'detectado',
  origen_alumno text,
  notas text,
  confirmado_por uuid,
  confirmado_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mp_preapprovals_estado_check CHECK (estado IN ('detectado','confirmado','ignorado'))
);

GRANT SELECT, INSERT, UPDATE ON public.mp_preapprovals TO authenticated;
GRANT ALL ON public.mp_preapprovals TO service_role;

ALTER TABLE public.mp_preapprovals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gestionan mapeos de preapprovals"
ON public.mp_preapprovals
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_mp_preapprovals_alumno ON public.mp_preapprovals(alumno_id);
CREATE INDEX IF NOT EXISTS idx_mp_preapprovals_estado ON public.mp_preapprovals(estado);

CREATE OR REPLACE FUNCTION public.mp_preapprovals_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mp_preapprovals_updated_at ON public.mp_preapprovals;
CREATE TRIGGER trg_mp_preapprovals_updated_at
BEFORE UPDATE ON public.mp_preapprovals
FOR EACH ROW EXECUTE FUNCTION public.mp_preapprovals_touch_updated_at();

-- Registro idempotente de identidad recurrente desde el sync (service_role).
CREATE OR REPLACE FUNCTION public.register_mp_preapproval_identity(
  _preapproval_id text,
  _mp_plan_id text DEFAULT NULL,
  _cuenta_mp_id uuid DEFAULT NULL,
  _payer_email text DEFAULT NULL,
  _descripcion text DEFAULT NULL,
  _importe numeric DEFAULT NULL,
  _moneda text DEFAULT NULL,
  _alumno_id uuid DEFAULT NULL,
  _seen_at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _preapproval_id IS NULL OR btrim(_preapproval_id) = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.mp_preapprovals AS mp (
    preapproval_id, mp_plan_id, cuenta_mp_id, payer_email, descripcion_mp,
    importe_referencia, moneda, alumno_id, origen_alumno, first_seen_at, last_seen_at
  ) VALUES (
    _preapproval_id, _mp_plan_id, _cuenta_mp_id, _payer_email, _descripcion,
    _importe, COALESCE(_moneda,'ARS'), _alumno_id,
    CASE WHEN _alumno_id IS NOT NULL THEN 'sugerido_sync' END,
    COALESCE(_seen_at, now()), COALESCE(_seen_at, now())
  )
  ON CONFLICT (preapproval_id) DO UPDATE SET
    mp_plan_id        = COALESCE(EXCLUDED.mp_plan_id, mp.mp_plan_id),
    cuenta_mp_id      = COALESCE(mp.cuenta_mp_id, EXCLUDED.cuenta_mp_id),
    payer_email       = COALESCE(EXCLUDED.payer_email, mp.payer_email),
    descripcion_mp    = COALESCE(EXCLUDED.descripcion_mp, mp.descripcion_mp),
    importe_referencia= COALESCE(EXCLUDED.importe_referencia, mp.importe_referencia),
    moneda            = COALESCE(EXCLUDED.moneda, mp.moneda),
    -- Nunca pisar una confirmación humana ni un alumno ya elegido a mano.
    alumno_id         = CASE
                          WHEN mp.estado = 'confirmado' THEN mp.alumno_id
                          WHEN mp.origen_alumno = 'confirmado_admin' THEN mp.alumno_id
                          ELSE COALESCE(mp.alumno_id, EXCLUDED.alumno_id)
                        END,
    origen_alumno     = CASE
                          WHEN mp.alumno_id IS NULL AND EXCLUDED.alumno_id IS NOT NULL THEN 'sugerido_sync'
                          ELSE mp.origen_alumno
                        END,
    first_seen_at     = LEAST(mp.first_seen_at, EXCLUDED.first_seen_at),
    last_seen_at      = GREATEST(mp.last_seen_at, EXCLUDED.last_seen_at);

  RETURN _preapproval_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_mp_preapproval_identity(text,text,uuid,text,text,numeric,text,uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_mp_preapproval_identity(text,text,uuid,text,text,numeric,text,uuid,timestamptz) TO service_role;

-- Confirmación / corrección manual del mapeo (admin). NO imputa pagos.
CREATE OR REPLACE FUNCTION public.confirm_mp_preapproval_mapping(
  _preapproval_id text,
  _alumno_id uuid DEFAULT NULL,
  _plan_id uuid DEFAULT NULL,
  _estado text DEFAULT 'confirmado',
  _notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF _estado NOT IN ('detectado','confirmado','ignorado') THEN
    RAISE EXCEPTION 'invalid_estado';
  END IF;

  SELECT * INTO v_prev FROM public.mp_preapprovals WHERE preapproval_id = _preapproval_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'preapproval_not_found'; END IF;

  IF _estado = 'confirmado' AND (_alumno_id IS NULL OR _plan_id IS NULL) THEN
    RAISE EXCEPTION 'alumno_y_plan_requeridos_para_confirmar';
  END IF;

  UPDATE public.mp_preapprovals SET
    alumno_id      = COALESCE(_alumno_id, alumno_id),
    plan_id        = COALESCE(_plan_id, plan_id),
    origen_alumno  = CASE WHEN _alumno_id IS NOT NULL THEN 'confirmado_admin' ELSE origen_alumno END,
    estado         = _estado,
    notas          = COALESCE(_notas, notas),
    confirmado_por = CASE WHEN _estado = 'confirmado' THEN auth.uid() ELSE confirmado_por END,
    confirmado_at  = CASE WHEN _estado = 'confirmado' THEN now() ELSE confirmado_at END
  WHERE preapproval_id = _preapproval_id;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), auth.email(), 'admin', 'mp_preapproval_mapping', 'mp_preapprovals', _preapproval_id,
    jsonb_build_object(
      'antes', jsonb_build_object('alumno_id', v_prev.alumno_id, 'plan_id', v_prev.plan_id, 'estado', v_prev.estado),
      'despues', jsonb_build_object('alumno_id', COALESCE(_alumno_id, v_prev.alumno_id), 'plan_id', COALESCE(_plan_id, v_prev.plan_id), 'estado', _estado),
      'notas', _notas,
      'nota_alcance', 'Solo identidad recurrente. No imputa pagos ni modifica suscripciones.'
    )
  );

  RETURN jsonb_build_object('ok', true, 'preapproval_id', _preapproval_id, 'estado', _estado);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_mp_preapproval_mapping(text,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_mp_preapproval_mapping(text,uuid,uuid,text,text) TO authenticated;

-- Vista de gestión: agrega los movimientos observados por preapproval.
CREATE OR REPLACE VIEW public.vw_mp_preapprovals_admin
WITH (security_invoker = true) AS
WITH movs AS (
  SELECT
    COALESCE(
      m.raw->'metadata'->>'preapproval_id',
      m.raw->'point_of_interaction'->'transaction_data'->>'subscription_id'
    ) AS pa,
    count(*) AS movimientos,
    min(m.fecha_movimiento) AS primera_fecha,
    max(m.fecha_movimiento) AS ultima_fecha,
    count(*) FILTER (WHERE m.suscripcion_id IS NULL) AS movimientos_sin_imputar
  FROM public.mp_account_movements m
  WHERE m.tipo = 'payment' AND m.status = 'approved'
  GROUP BY 1
)
SELECT
  p.preapproval_id,
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
  a.nombre || ' ' || COALESCE(a.apellido, '') AS alumno_nombre,
  p.plan_id,
  pl.nombre AS plan_nombre,
  p.confirmado_por,
  p.confirmado_at,
  COALESCE(mv.movimientos, 0) AS movimientos_vistos,
  COALESCE(mv.movimientos_sin_imputar, 0) AS movimientos_sin_imputar,
  COALESCE(mv.primera_fecha, p.first_seen_at) AS primera_fecha,
  COALESCE(mv.ultima_fecha, p.last_seen_at) AS ultima_fecha,
  p.created_at,
  p.updated_at
FROM public.mp_preapprovals p
LEFT JOIN movs mv ON mv.pa = p.preapproval_id
LEFT JOIN public.alumnos a ON a.id = p.alumno_id
LEFT JOIN public.planes pl ON pl.id = p.plan_id;

GRANT SELECT ON public.vw_mp_preapprovals_admin TO authenticated;
GRANT SELECT ON public.vw_mp_preapprovals_admin TO service_role;