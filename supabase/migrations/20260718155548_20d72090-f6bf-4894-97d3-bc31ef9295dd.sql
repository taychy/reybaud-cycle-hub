
ALTER TABLE public.delivery_list_items
  ADD COLUMN IF NOT EXISTS alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aviso_retiro_enviado_at timestamptz,
  ADD COLUMN IF NOT EXISTS aviso_retiro_channel text,
  ADD COLUMN IF NOT EXISTS aviso_retiro_enviado_por uuid;

CREATE INDEX IF NOT EXISTS idx_delivery_list_items_alumno
  ON public.delivery_list_items(alumno_id);

INSERT INTO public.email_templates (
  key, subject, html_body, text_body, category, wired, is_active, description,
  variables, required_variables
)
VALUES (
  'delivery-ready-pickup',
  'Tu pedido de {lista_titulo} ya está listo para retirar',
  $HTML$<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#ffffff;color:#111827">
  <div style="background:#1a1a2e;border-radius:12px;padding:24px;color:#ffffff">
    <h2 style="color:#f59e0b;margin:0 0 12px">Tu pedido está listo 🚚</h2>
    <p style="color:#e5e7eb;margin:0 0 12px">Hola <strong style="color:#ffffff">{alumno_nombre}</strong>,</p>
    <p style="color:#e5e7eb;margin:0 0 12px">Tu pedido de <strong style="color:#ffffff">{lista_titulo}</strong> ya está preparado. Podés retirarlo en la camioneta de la escuela en tu próxima clase.</p>
    <div style="background:#2d2d44;border-radius:8px;padding:14px;margin:16px 0">
      <div style="color:#f59e0b;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Detalle del pedido</div>
      <div style="color:#e5e7eb;font-size:14px;line-height:1.6">{pedido_detalle_html}</div>
    </div>
    <div style="background:#3b2f1a;border:1px solid #f59e0b40;border-radius:8px;padding:12px;margin:16px 0">
      <p style="margin:0;color:#fde68a;font-size:13px;line-height:1.6">¿Querés saber cuánto te resta pagar? Admin se va a comunicar con vos para avisarte, o podés <a href="mailto:{reply_email}?subject=Consulta%20sobre%20{lista_titulo}" style="color:#fbbf24;text-decoration:underline">responder este mail</a> con tu consulta.</p>
    </div>
    <p style="color:#9ca3af;font-size:12px;margin:16px 0 0">Ciclismo Reybaud · ¡Nos vemos en la clase!</p>
  </div>
</div>$HTML$,
  $TXT$Hola {alumno_nombre},

Tu pedido de {lista_titulo} ya está preparado. Podés retirarlo en la camioneta de la escuela en tu próxima clase.

Detalle:
{pedido_detalle_txt}

¿Querés saber cuánto te resta pagar? Admin se va a comunicar con vos, o podés responder este mail con la consulta ({reply_email}).

Ciclismo Reybaud$TXT$,
  'transactional',
  true,
  true,
  'Aviso al alumno de que su pedido de la lista de entrega está listo para retirar en la camioneta.',
  '[
    {"name":"alumno_nombre","description":"Nombre del alumno","example":"Juan Pérez"},
    {"name":"lista_titulo","description":"Título de la lista de entrega","example":"Preventa Santini Invierno"},
    {"name":"pedido_detalle_html","description":"Detalle del pedido en HTML","example":"• Campera M<br/>• Guantes L"},
    {"name":"pedido_detalle_txt","description":"Detalle del pedido en texto","example":"- Campera M"},
    {"name":"reply_email","description":"Email de contacto para responder","example":"natalia@ciclismoreybaud.com"}
  ]'::jsonb,
  '["alumno_nombre","lista_titulo","pedido_detalle_html"]'::jsonb
)
ON CONFLICT (key) DO NOTHING;
