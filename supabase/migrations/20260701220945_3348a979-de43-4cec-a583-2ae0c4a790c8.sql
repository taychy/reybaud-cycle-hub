-- Fase 2: Email templates editables con versionado y restauración

CREATE TABLE public.email_templates (
  key TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT,
  wired BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID,
  updated_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/coach/deposito can read templates"
ON public.email_templates FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
  OR public.has_role(auth.uid(), 'coach'::app_role)
  OR public.has_role(auth.uid(), 'deposito'::app_role)
);

CREATE POLICY "Only super_admin can update templates"
ON public.email_templates FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.email_templates_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL REFERENCES public.email_templates(key) ON DELETE CASCADE,
  version_number INT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  changed_by UUID,
  changed_by_name TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  UNIQUE (template_key, version_number)
);

GRANT SELECT ON public.email_templates_versions TO authenticated;
GRANT ALL ON public.email_templates_versions TO service_role;

ALTER TABLE public.email_templates_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/super_admin can read version history"
ON public.email_templates_versions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
);

CREATE OR REPLACE FUNCTION public.email_templates_snapshot_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_ver INT;
BEGIN
  IF NEW.subject = OLD.subject
     AND NEW.html_body = OLD.html_body
     AND COALESCE(NEW.text_body,'') = COALESCE(OLD.text_body,'') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version_number),0) + 1
    INTO next_ver
  FROM public.email_templates_versions
  WHERE template_key = OLD.key;

  INSERT INTO public.email_templates_versions
    (template_key, version_number, subject, html_body, text_body,
     changed_by, changed_by_name, changed_at)
  VALUES
    (OLD.key, next_ver, OLD.subject, OLD.html_body, OLD.text_body,
     OLD.updated_by, OLD.updated_by_name, OLD.updated_at);

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_email_templates_snapshot
BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.email_templates_snapshot_version();

-- Seed inicial: 7 plantillas
INSERT INTO public.email_templates (key, subject, html_body, description, variables, required_variables, wired) VALUES

('renewal_pending',
 'Tu plan {plan_nombre} se renovó — regularizá antes del 5',
 '<div style="font-family:system-ui,sans-serif;color:#111;max-width:560px;padding:20px">
  <h2 style="color:#ea580c;margin:0 0 12px">Tu plan se renovó automáticamente</h2>
  <p>Hola <b>{alumno_nombre}</b>,</p>
  <p>Tu plan <b>{plan_nombre}</b> arrancó un nuevo período: del <b>{fecha_inicio}</b> al <b>{fecha_fin}</b>.</p>
  <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:16px 0;background:#fff7ed">
    <p style="margin:0;color:#6b7280;font-size:12px">Monto a pagar</p>
    <p style="margin:4px 0 0;font-size:24px;font-weight:700;color:#ea580c">{monto}</p>
  </div>
  <p><b>Tenés hasta el 5 de este mes</b> para regularizar sin perder acceso a la app. Si no llegás, la suscripción pasa a "vencida" y el acceso queda pausado hasta el pago.</p>
  <a href="{link_pago}" style="display:block;background:#22c55e;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:600;margin:16px 0">Pagar ahora</a>
  <p style="color:#6b7280;font-size:12px">Si ya pagaste, ignorá este mensaje. Cualquier duda, respondé este mail.</p>
</div>',
 'Aviso mensual al alumno cuando el cron crea una nueva suscripción pendiente por renovación automática. Se envía el día 1 de cada mes.',
 '[{"name":"alumno_nombre","description":"Nombre del alumno","example":"Mercedes"},{"name":"plan_nombre","description":"Nombre del plan","example":"Pase Libre"},{"name":"fecha_inicio","description":"Inicio del nuevo período","example":"01/07/2026"},{"name":"fecha_fin","description":"Fin del nuevo período","example":"31/07/2026"},{"name":"monto","description":"Monto con moneda","example":"$150.000"},{"name":"link_pago","description":"URL al checkout","example":"https://reybaud-app.com/planes"}]'::jsonb,
 '["alumno_nombre","plan_nombre","monto","link_pago"]'::jsonb,
 true),

('admin_test_email',
 '✅ Email de prueba — Reybaud Admin',
 '<div style="font-family:system-ui,sans-serif;color:#111;max-width:560px;padding:20px">
  <h2>Email de prueba</h2>
  <p>Si recibís este mensaje, el dominio de envío y la cola de notificaciones funcionan correctamente.</p>
  <p style="color:#6b7280;font-size:12px">{timestamp}</p>
</div>',
 'Email manual de prueba para verificar dominio y cola.',
 '[{"name":"timestamp","description":"Fecha/hora ISO del envío"}]'::jsonb,
 '[]'::jsonb,
 true),

('reservation_confirmed_with_payment',
 'Tu reserva fue confirmada — coordinemos la seña',
 '<div style="font-family:system-ui,sans-serif;color:#111;max-width:560px;padding:20px"><h2>¡Tu reserva está confirmada!</h2><p>Hola <b>{alumno_nombre}</b>, ya quedaste anotado en <b>{evento_nombre}</b>.</p><div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:16px 0"><p style="margin:0;color:#6b7280;font-size:12px">Próximo pago sugerido</p><p style="margin:4px 0 0;font-size:24px;font-weight:700;color:#ea580c">{monto_sena}</p><p style="margin:8px 0 0;color:#6b7280;font-size:12px">Seña</p></div><a href="{link_mp}" style="display:block;background:#22c55e;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:600;margin-bottom:8px">Pagar ahora con Mercado Pago</a><a href="{link_efectivo}" style="display:block;background:#fff;color:#111;border:2px solid #f59e0b;text-decoration:none;text-align:center;padding:12px;border-radius:10px;font-weight:600">Voy a pagar en efectivo</a></div>',
 'Email al participante cuando admin confirma su reserva.',
 '[{"name":"alumno_nombre"},{"name":"evento_nombre"},{"name":"monto_sena"},{"name":"link_mp"},{"name":"link_efectivo"}]'::jsonb,
 '["alumno_nombre","evento_nombre","monto_sena"]'::jsonb,
 false),

('reservation_payment_reported',
 '💳 Pago informado — reserva {reserva_id}',
 '<div style="font-family:system-ui,sans-serif;padding:20px"><h2>💳 Pago informado</h2><p>{alumno_nombre} reportó un pago de <b>{monto}</b> vía <b>{metodo}</b>.</p><a href="{link_reserva}" style="background:#0ea5e9;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ver reserva</a></div>',
 'Notificación a admin cuando el alumno reporta un pago.',
 '[{"name":"alumno_nombre"},{"name":"reserva_id"},{"name":"monto"},{"name":"metodo"},{"name":"link_reserva"}]'::jsonb,
 '["alumno_nombre","monto","metodo"]'::jsonb,
 false),

('reservation_cash_announced',
 '💵 Efectivo anunciado — reserva {reserva_id}',
 '<div style="font-family:system-ui,sans-serif;padding:20px"><h2>💵 Efectivo anunciado</h2><p>{alumno_nombre} avisó que pagará <b>{monto}</b> en efectivo en <b>{lugar}</b> antes del {fecha_limite}.</p><div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:10px;border-radius:6px;margin:12px 0">El pago aún no está acreditado.</div></div>',
 'Notificación a admin cuando un alumno anuncia efectivo.',
 '[{"name":"alumno_nombre"},{"name":"reserva_id"},{"name":"monto"},{"name":"lugar"},{"name":"fecha_limite"}]'::jsonb,
 '["alumno_nombre","monto"]'::jsonb,
 false),

('reservation_cash_collected',
 '✅ Efectivo cobrado — reserva {reserva_id}',
 '<div style="font-family:system-ui,sans-serif;padding:20px"><h2>✅ Efectivo cobrado</h2><p>Se acreditó el pago en efectivo de {alumno_nombre} por <b>{monto}</b>.</p></div>',
 'Notificación a admin cuando se marca efectivo cobrado.',
 '[{"name":"alumno_nombre"},{"name":"reserva_id"},{"name":"monto"}]'::jsonb,
 '["alumno_nombre","monto"]'::jsonb,
 false),

('reservation_checklist_critical_progress',
 '⚠️ Checklist crítico — reserva {reserva_id}',
 '<div style="font-family:system-ui,sans-serif;padding:20px"><h2>⚠️ Checklist crítico</h2><p>{alumno_nombre} completó: <b>{item}</b>.</p></div>',
 'Alerta a admin cuando un alumno completa un item crítico.',
 '[{"name":"alumno_nombre"},{"name":"reserva_id"},{"name":"item"}]'::jsonb,
 '["alumno_nombre","item"]'::jsonb,
 false);
