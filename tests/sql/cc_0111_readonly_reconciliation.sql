-- READ ONLY: reusable pre-production reconciliation for candidate 0111.
-- Contains no writes and no production identifiers. It projects only affected rows;
-- it does not claim to execute the candidate or replace full-account before/after checks.
WITH objetivos AS (
  SELECT s.id,s.alumno_id,COALESCE(p.moneda,'ARS') moneda,
    COALESCE(s.precio_final,s.precio_base,p.precio,0) precio
  FROM public.suscripciones s
  LEFT JOIN public.planes p ON p.id=s.plan_id
  WHERE s.cancelada_at IS NULL
    AND s.estado IN ('activa','pendiente_verificacion','vencida','finalizada','conciliado')
    AND public.is_subscription_paid(s.id,s.metodo_pago,s.mp_status,s.origen_registro,s.chequeado_admin,s.mp_payment_id)
    AND NOT EXISTS(SELECT 1 FROM public.mp_account_movements mp WHERE mp.suscripcion_id=s.id AND mp.status='approved')
    AND s.metodo_pago IS DISTINCT FROM 'saldo_a_favor'
    AND EXISTS(SELECT 1 FROM public.pagos_imputaciones pi
      WHERE pi.obligacion_tipo='suscripcion' AND pi.obligacion_id=s.id AND pi.anulado_at IS NULL)
), calc AS (
  SELECT o.*,COALESCE((SELECT sum(pi.monto) FROM public.pagos_imputaciones pi
    WHERE pi.obligacion_tipo='suscripcion' AND pi.obligacion_id=o.id AND pi.anulado_at IS NULL),0) imputado,
    COALESCE((SELECT sum(ca.monto) FROM public.cuenta_ajustes ca
      WHERE ca.tipo='credito' AND ca.aplicado_a_fuente_tabla='suscripciones' AND ca.aplicado_a_fuente_id=o.id
        AND EXISTS(SELECT 1 FROM public.mp_account_movements mp
          JOIN public.pagos_imputaciones pi ON pi.pago_origen_tipo='mp_movement' AND pi.pago_origen_id=mp.id
            AND pi.obligacion_tipo='suscripcion' AND pi.obligacion_id=o.id AND pi.anulado_at IS NULL
          WHERE mp.mp_payment_id=ca.referencia_externa AND mp.cuenta_mp_id=ca.cuenta_mp_id
            AND upper(mp.currency)=upper(ca.moneda) AND mp.status='approved' AND mp.direccion='ingreso')),0) addback
  FROM objetivos o
)
SELECT id suscripcion_id,alumno_id,moneda,precio haber_manual_antes,imputado,addback,
  GREATEST(0,precio-imputado+LEAST(imputado,addback)) haber_manual_despues,
  precio-GREATEST(0,precio-imputado+LEAST(imputado,addback)) reduccion_estimada
FROM calc ORDER BY alumno_id,moneda,id;

-- Independent-evidence review: no receipt contents or URLs are returned.
WITH objetivos AS (
  SELECT s.id,s.alumno_id FROM public.suscripciones s
  WHERE s.cancelada_at IS NULL
    AND s.estado IN ('activa','pendiente_verificacion','vencida','finalizada','conciliado')
    AND public.is_subscription_paid(s.id,s.metodo_pago,s.mp_status,s.origen_registro,s.chequeado_admin,s.mp_payment_id)
    AND NOT EXISTS(SELECT 1 FROM public.mp_account_movements mp WHERE mp.suscripcion_id=s.id AND mp.status='approved')
    AND s.metodo_pago IS DISTINCT FROM 'saldo_a_favor'
    AND EXISTS(SELECT 1 FROM public.pagos_imputaciones pi
      WHERE pi.obligacion_tipo='suscripcion' AND pi.obligacion_id=s.id AND pi.anulado_at IS NULL)
)
SELECT o.id suscripcion_id,ca.id credito_id,ca.monto,ca.moneda,ca.referencia_externa,
  (ca.comprobante_url IS NOT NULL) tiene_comprobante,
  EXISTS(SELECT 1 FROM public.mp_account_movements mp
    WHERE mp.mp_payment_id=ca.referencia_externa
      AND (ca.cuenta_mp_id IS NULL OR mp.cuenta_mp_id=ca.cuenta_mp_id)
      AND mp.status='approved' AND mp.direccion='ingreso') referencia_mp_existe,
  CASE WHEN ca.referencia_externa IS NULL AND ca.comprobante_url IS NULL
    THEN 'REVISION_MANUAL_SIN_REFERENCIA_INDEPENDIENTE'
    ELSE 'VERIFICAR_CAUSALIDAD_DE_REFERENCIA' END revision
FROM objetivos o
JOIN public.cuenta_ajustes ca ON ca.alumno_id=o.alumno_id AND ca.tipo='credito'
  AND ca.aplicado_a_fuente_tabla='suscripciones' AND ca.aplicado_a_fuente_id=o.id
ORDER BY o.id,ca.created_at;
