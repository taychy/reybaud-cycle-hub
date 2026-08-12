ALTER TABLE public.servicios_turnera
  ADD COLUMN IF NOT EXISTS email_coach_recordatorio_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS coach_recordatorio_horas_antes integer NOT NULL DEFAULT 24;

ALTER TABLE public.reservas_turnera
  ADD COLUMN IF NOT EXISTS coach_recordatorio_enviado_at timestamptz;

CREATE OR REPLACE VIEW public.vw_turnera_sede_backfill AS
SELECT
  r.id,
  r.fecha,
  r.hora_inicio,
  r.estado_operativo,
  r.nombre,
  r.apellido,
  r.coach_id,
  r.servicio_id,
  cand.sede_id AS sede_sugerida,
  cand.n_sedes,
  CASE WHEN cand.n_sedes = 1 THEN 'determinista' ELSE 'revision_manual' END AS clasificacion
FROM public.reservas_turnera r
LEFT JOIN LATERAL (
  SELECT count(DISTINCT d.sede_id) AS n_sedes,
         min(d.sede_id::text)::uuid AS sede_id
  FROM public.disponibilidad_coaches d
  WHERE d.coach_id = r.coach_id
    AND d.servicio_id = r.servicio_id
    AND d.sede_id IS NOT NULL
    AND d.dia_semana = EXTRACT(dow FROM r.fecha)::int
    AND r.hora_inicio >= d.hora_inicio
    AND r.hora_inicio < d.hora_fin
) cand ON true
WHERE r.sede_id IS NULL;

GRANT SELECT ON public.vw_turnera_sede_backfill TO authenticated;
GRANT ALL ON public.vw_turnera_sede_backfill TO service_role;

CREATE OR REPLACE FUNCTION public.backfill_turnera_sede(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_det int;
  v_rev int;
  v_upd int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT count(*) FILTER (WHERE clasificacion = 'determinista'),
         count(*) FILTER (WHERE clasificacion <> 'determinista')
    INTO v_det, v_rev
  FROM public.vw_turnera_sede_backfill;

  IF NOT p_dry_run THEN
    WITH det AS (
      SELECT id, sede_sugerida FROM public.vw_turnera_sede_backfill
      WHERE clasificacion = 'determinista' AND sede_sugerida IS NOT NULL
    )
    UPDATE public.reservas_turnera r
       SET sede_id = det.sede_sugerida
      FROM det
     WHERE r.id = det.id;
    GET DIAGNOSTICS v_upd = ROW_COUNT;

    INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
    VALUES (auth.uid(), auth.email(), 'admin', 'backfill_turnera_sede', 'reservas_turnera', 'bulk',
            jsonb_build_object('actualizadas', v_upd, 'pendientes_revision', v_rev));
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'deterministas', v_det,
    'revision_manual', v_rev,
    'actualizadas', v_upd
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_turnera_sede(boolean) TO authenticated;