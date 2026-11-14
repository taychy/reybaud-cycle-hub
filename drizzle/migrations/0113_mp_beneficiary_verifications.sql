-- Permite identificar beneficiarios de transferencias sin atribuir un nombre que Mercado Pago no informó.
-- Identificación independiente de la conciliación de gastos y devoluciones.
CREATE TABLE IF NOT EXISTS public.mp_beneficiary_verifications (
  movement_id uuid PRIMARY KEY REFERENCES public.mp_account_movements(id) ON DELETE CASCADE,
  recipient_name text NOT NULL CHECK (char_length(btrim(recipient_name)) BETWEEN 2 AND 160),
  evidence_note text NOT NULL CHECK (char_length(btrim(evidence_note)) BETWEEN 8 AND 1000),
  verified_by uuid NOT NULL REFERENCES auth.users(id),
  verified_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mp_beneficiary_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mp_beneficiary_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.mp_beneficiary_verifications TO authenticated;

DROP POLICY IF EXISTS mp_beneficiary_verifications_admin_read ON public.mp_beneficiary_verifications;
CREATE POLICY mp_beneficiary_verifications_admin_read
  ON public.mp_beneficiary_verifications
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.is_super_admin(auth.uid())));

CREATE OR REPLACE FUNCTION public.identify_mp_egress_beneficiary(
  p_movement_id uuid,
  p_recipient_name text,
  p_evidence_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_movement record;
  v_previous record;
  v_name text := btrim(coalesce(p_recipient_name,''));
  v_evidence text := btrim(coalesce(p_evidence_note,''));
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF char_length(v_name) NOT BETWEEN 2 AND 160 OR char_length(v_evidence) NOT BETWEEN 8 AND 1000 THEN
    RAISE EXCEPTION 'Nombre o respaldo inválido';
  END IF;

  SELECT id, mp_payment_id, direccion, status INTO v_movement
    FROM public.mp_account_movements WHERE id=p_movement_id FOR UPDATE;
  IF NOT FOUND OR v_movement.direccion <> 'egreso' OR v_movement.status <> 'approved' THEN
    RAISE EXCEPTION 'Solo se pueden identificar egresos aprobados de Mercado Pago';
  END IF;

  SELECT recipient_name, evidence_note INTO v_previous
    FROM public.mp_beneficiary_verifications WHERE movement_id=p_movement_id;

  INSERT INTO public.mp_beneficiary_verifications
    (movement_id, recipient_name, evidence_note, verified_by, verified_at)
  VALUES (p_movement_id, v_name, v_evidence, auth.uid(), now())
  ON CONFLICT (movement_id) DO UPDATE
    SET recipient_name=excluded.recipient_name,
        evidence_note=excluded.evidence_note,
        verified_by=excluded.verified_by,
        verified_at=excluded.verified_at;

  INSERT INTO public.audit_log(user_id,user_email,user_role,action,entity_type,entity_id,details)
  VALUES (auth.uid(),auth.email(),
    CASE WHEN public.is_super_admin(auth.uid()) THEN 'super_admin' ELSE 'admin' END,
    'identificar_beneficiario_egreso_mp',
    'mp_account_movements',p_movement_id::text,
    jsonb_build_object(
      'operacion_mp',v_movement.mp_payment_id,
      'nombre_anterior',v_previous.recipient_name,
      'nombre_nuevo',v_name,
      'respaldo',v_evidence,
      'clasificacion_financiera_modificada',false
    )
  );

  RETURN jsonb_build_object('ok',true,'movement_id',p_movement_id,'recipient_name',v_name);
END;
$$;

REVOKE ALL ON FUNCTION public.identify_mp_egress_beneficiary(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identify_mp_egress_beneficiary(uuid,text,text) TO authenticated, service_role;
