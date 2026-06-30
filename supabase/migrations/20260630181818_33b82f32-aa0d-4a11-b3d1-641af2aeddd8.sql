
CREATE TABLE public.email_dlq_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT,
  recipient_email TEXT,
  decision TEXT NOT NULL,
  reason TEXT,
  original_error TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by TEXT DEFAULT 'unsubscribe_token_fix_2026_06_30'
);
GRANT SELECT ON public.email_dlq_decisions TO authenticated;
GRANT ALL ON public.email_dlq_decisions TO service_role;
ALTER TABLE public.email_dlq_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read dlq decisions" ON public.email_dlq_decisions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.email_dlq_decisions (message_id, template_name, recipient_email, decision, reason, original_error)
SELECT DISTINCT ON (l.message_id)
  l.message_id,
  l.template_name,
  l.recipient_email,
  CASE
    WHEN l.template_name IN ('installment_today','installment_upcoming','installment_overdue') THEN 'requeued'
    WHEN l.template_name IN ('factura_emitida','preorder_payment_reminder_manual','medical_certificate_request') THEN 'manual_review'
    ELSE 'discarded'
  END,
  CASE
    WHEN l.template_name IN ('installment_today','installment_upcoming','installment_overdue')
      THEN 'Recordatorio de cuota vigente: reencolado tras fix centralizado de unsubscribe_token'
    WHEN l.template_name = 'factura_emitida'
      THEN 'Copia de factura ya emitida: requiere reenvio manual desde Facturacion para evitar duplicados'
    WHEN l.template_name = 'preorder_payment_reminder_manual'
      THEN 'Recordatorio manual de preventa: revisar si sigue activa antes de reenviar'
    WHEN l.template_name = 'medical_certificate_request'
      THEN 'Pedido de apto medico: revisar si el alumno ya lo subio antes de reenviar'
    ELSE 'Notificacion administrativa o pago ya gestionado: descartado para evitar duplicados'
  END,
  l.error_message
FROM public.email_send_log l
WHERE l.status = 'dlq'
ORDER BY l.message_id, l.created_at DESC;
