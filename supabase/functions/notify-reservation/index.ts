const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface NotifyPayload {
  reservation_id: string;
  alumno_id: string;
  tipo: 'pago_registrado' | 'cuota_pendiente' | 'cuota_proxima' | 'novedad' | 'recordatorio_manual';
  asunto: string;
  contenido_html: string;
  contenido_texto: string;
  enviado_por?: string;
  enviado_por_email?: string;
  metadata?: Record<string, any>;
  idempotency_key?: string;
  canal?: 'email' | 'whatsapp_manual';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: NotifyPayload = await req.json();

    if (!payload.reservation_id || !payload.alumno_id || !payload.tipo || !payload.asunto || !payload.contenido_html) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check idempotency
    if (payload.idempotency_key) {
      const { data: existing } = await supabase
        .from('reservation_notifications')
        .select('id')
        .eq('idempotency_key', payload.idempotency_key)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ success: true, duplicate: true, id: existing.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Get student email
    const { data: alumno } = await supabase
      .from('alumnos')
      .select('email, nombre, apellido')
      .eq('id', payload.alumno_id)
      .single();

    if (!alumno?.email) {
      return new Response(JSON.stringify({ error: 'Student not found or no email' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const canal = payload.canal || 'email';
    let emailSent = false;

    // Send email if canal is email
    if (canal === 'email') {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Reybaud Ciclismo <notificaciones@reybaud-app.com>',
          to: [alumno.email],
          subject: payload.asunto,
          html: payload.contenido_html,
          text: payload.contenido_texto,
        }),
      });

      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        console.error('Resend error:', errBody);
        return new Response(JSON.stringify({ error: 'Email send failed', detail: errBody }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      emailSent = true;
    }

    // Log notification
    const { data: notif, error: insertErr } = await supabase
      .from('reservation_notifications')
      .insert({
        reservation_id: payload.reservation_id,
        alumno_id: payload.alumno_id,
        tipo: payload.tipo,
        canal,
        asunto: payload.asunto,
        contenido: payload.contenido_texto,
        enviado_por: payload.enviado_por || null,
        enviado_por_email: payload.enviado_por_email || null,
        metadata: payload.metadata || {},
        idempotency_key: payload.idempotency_key || null,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('Insert error:', insertErr);
    }

    return new Response(JSON.stringify({
      success: true,
      email_sent: emailSent,
      notification_id: notif?.id,
      recipient: alumno.email,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
