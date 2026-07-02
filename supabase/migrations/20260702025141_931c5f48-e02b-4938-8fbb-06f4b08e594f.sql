
-- 1) category column
ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'transactional';

-- 2) allow admins to edit broadcast/price_alert templates (super_admin keeps all)
DROP POLICY IF EXISTS "Admins can edit broadcast and price_alert templates" ON public.email_templates;
CREATE POLICY "Admins can edit broadcast and price_alert templates"
ON public.email_templates
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND category IN ('broadcast','price_alert')
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND category IN ('broadcast','price_alert')
);

-- allow admins to INSERT broadcast/price_alert templates
DROP POLICY IF EXISTS "Admins can insert broadcast templates" ON public.email_templates;
CREATE POLICY "Admins can insert broadcast templates"
ON public.email_templates
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND category IN ('broadcast','price_alert')
);

-- allow admins to DELETE broadcast templates only
DROP POLICY IF EXISTS "Admins can delete broadcast templates" ON public.email_templates;
CREATE POLICY "Admins can delete broadcast templates"
ON public.email_templates
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND category = 'broadcast'
);

-- 3) seed the 3 price-alert templates (only if missing)
INSERT INTO public.email_templates (key, subject, html_body, description, category, wired, is_active, variables, required_variables)
VALUES
(
  'price_alert_paid_full',
  '🎉 ¡Tu lugar en {eventTitle} ya está asegurado a precio congelado!',
  E'<p style="margin:0 0 10px;color:{brandColor};font-weight:700;font-size:14px;letter-spacing:0.3px;line-height:1.4;">🎉 ¡Tu lugar ya está asegurado a precio congelado!</p>\n<h1 style="font-size:22px;margin:0 0 14px;color:{brandColor};line-height:1.25;">{eventTitle}</h1>\n<p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;line-height:1.6;">Hola {nombre} 👋<br/><br/>Ya reservaste y con tu seña <b>tu precio quedó congelado para siempre</b> :) . El resto de la gente no corre con la misma suerte: el <b>{fechaCorta}</b> sube{diffPctSuffix}.</p>\n\n<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:12px 0;">\n  <table style="width:100%;font-size:14px;border-collapse:collapse;">\n    {priceRows}\n  </table>\n  <div style="font-size:11px;color:#555;margin-top:8px;line-height:1.4;">* Precio base = el paquete más económico. Detalle por paquete abajo ⬇</div>\n</div>\n\n{packagesBlock}\n\n<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;margin:16px 0;">\n  <div style="font-size:14px;color:#14532d;line-height:1.55;">\n    💡 <b>Tip:</b> si tenés amigos que quieran sumarse, avisales que les conviene reservar <b>antes del {fechaCorta}</b> para entrar al precio actual.\n  </div>\n</div>\n\n<div style="text-align:center;margin:26px 0 8px;">\n  <a href="{ctaHref}" style="display:inline-block;background:{brandColor};color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:10px;font-weight:600;font-size:15px;">Compartir el evento →</a>\n</div>',
  'Aviso de aumento — variante para alumnos que YA pagaron su reserva (precio congelado).',
  'price_alert',
  true, true,
  '[{"name":"nombre"},{"name":"eventTitle"},{"name":"fechaCorta","description":"Ej: 2/07 a las 00 hs"},{"name":"diffPctSuffix","description":"Ej: \" un +15%\" o vacío"},{"name":"priceRows","description":"Filas <tr> del cuadro comparativo (autogeneradas)"},{"name":"packagesBlock","description":"Bloque HTML con la tabla de paquetes (autogenerado)"},{"name":"ctaHref"},{"name":"brandColor","description":"#FF6B1A"}]'::jsonb,
  '["nombre","eventTitle","fechaCorta","ctaHref","brandColor"]'::jsonb
),
(
  'price_alert_with_balance',
  '⏰ Última llamada — el precio de {eventTitle} sube en breve',
  E'<p style="margin:0 0 10px;color:{brandColor};font-weight:700;font-size:14px;letter-spacing:0.3px;line-height:1.4;">⏰ Última llamada — el precio sube en breve</p>\n<h1 style="font-size:22px;margin:0 0 14px;color:{brandColor};line-height:1.25;">{eventTitle}</h1>\n<p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;line-height:1.6;">Hola {nombre} 👋<br/><br/>Tenés tu lugar reservado, pero como <b>todavía no pagaste la seña</b>, tu precio no está congelado. El <b>{fechaCorta}</b> sube{diffPctSuffix}.</p>\n\n<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:12px 0;">\n  <table style="width:100%;font-size:14px;border-collapse:collapse;">\n    {priceRows}\n  </table>\n  <div style="font-size:11px;color:#555;margin-top:8px;line-height:1.4;">* Precio base = el paquete más económico. Detalle por paquete abajo ⬇</div>\n</div>\n\n{packagesBlock}\n\n<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;margin:16px 0;">\n  <div style="font-size:14px;color:#7c2d12;line-height:1.55;">\n    Pagá la seña <b>antes del {fechaCorta}</b> y evitás el aumento. Después de esa fecha, <b>no hay vuelta atrás</b>.\n  </div>\n</div>\n\n<div style="text-align:center;margin:26px 0 8px;">\n  <a href="{ctaHref}" style="display:inline-block;background:{brandColor};color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:10px;font-weight:600;font-size:15px;">Ir a mi reserva y pagar la seña →</a>\n</div>',
  'Aviso de aumento — variante para alumnos con reserva pero sin seña pagada.',
  'price_alert',
  true, true,
  '[{"name":"nombre"},{"name":"eventTitle"},{"name":"fechaCorta"},{"name":"diffPctSuffix"},{"name":"priceRows"},{"name":"packagesBlock"},{"name":"ctaHref"},{"name":"brandColor"}]'::jsonb,
  '["nombre","eventTitle","fechaCorta","ctaHref","brandColor"]'::jsonb
),
(
  'price_alert_interested',
  '⏰ Última chance al precio actual de {eventTitle}',
  E'<p style="margin:0 0 10px;color:{brandColor};font-weight:700;font-size:14px;letter-spacing:0.3px;line-height:1.4;">⏰ ÚLTIMA CHANCE AL PRECIO ACTUAL</p>\n<h1 style="font-size:22px;margin:0 0 14px;color:{brandColor};line-height:1.25;">{eventTitle}</h1>\n<p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;line-height:1.6;">Hola {nombre} 👋<br/><br/>Sabemos que te interesa <b>{eventTitle}</b>. El <b>{fechaCorta}</b> sube{diffPctSuffix}. <b>Reservando ahora congelás el precio actual</b>.</p>\n\n<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:12px 0;">\n  <table style="width:100%;font-size:14px;border-collapse:collapse;">\n    {priceRows}\n  </table>\n  <div style="font-size:11px;color:#555;margin-top:8px;line-height:1.4;">* Precio base = el paquete más económico. Detalle por paquete abajo ⬇</div>\n</div>\n\n{packagesBlock}\n\n<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;margin:16px 0;">\n  <div style="font-size:14px;color:#7c2d12;line-height:1.55;">\n    Con la <b>seña de reserva</b> te asegurás el precio actual. Después del {fechaCorta} vas a pagar el precio nuevo.\n  </div>\n</div>\n\n<div style="text-align:center;margin:26px 0 8px;">\n  <a href="{ctaHref}" style="display:inline-block;background:{brandColor};color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:10px;font-weight:600;font-size:15px;">Reservar antes del aumento →</a>\n</div>',
  'Aviso de aumento — variante para alumnos interesados (favoritos) sin reserva.',
  'price_alert',
  true, true,
  '[{"name":"nombre"},{"name":"eventTitle"},{"name":"fechaCorta"},{"name":"diffPctSuffix"},{"name":"priceRows"},{"name":"packagesBlock"},{"name":"ctaHref"},{"name":"brandColor"}]'::jsonb,
  '["nombre","eventTitle","fechaCorta","ctaHref","brandColor"]'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- 4) mark existing templates as transactional
UPDATE public.email_templates SET category='transactional' WHERE category='transactional' AND key NOT LIKE 'price_alert%';
