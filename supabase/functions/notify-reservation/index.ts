const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
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

    // Get recipient email - check alumno first, then external participant
    let recipientEmail = '';
    let recipientName = '';

    if (payload.alumno_id) {
      const { data: alumno } = await supabase
        .from('alumnos')
        .select('email, nombre, apellido')
        .eq('id', payload.alumno_id)
        .single();
      if (alumno?.email) {
        recipientEmail = alumno.email;
        recipientName = `${alumno.nombre} ${alumno.apellido || ''}`.trim();
      }
    }

    // Fallback: check external participant via reservation
    if (!recipientEmail && payload.reservation_id) {
      const { data: res } = await supabase
        .from('event_reservations')
        .select('external_participant_id')
        .eq('id', payload.reservation_id)
        .single();
      if (res?.external_participant_id) {
        const { data: ext } = await supabase
          .from('event_external_participants')
          .select('email, nombre, apellido')
          .eq('id', res.external_participant_id)
          .single();
        if (ext?.email) {
          recipientEmail = ext.email;
          recipientName = `${ext.nombre} ${ext.apellido || ''}`.trim();
        }
      }
    }

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: 'Participant not found or no email', error_code: 'participant_not_found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const canal = payload.canal || 'email';
    let emailSent = false;
    let emailError: string | null = null;

    // Send email if canal is email
    if (canal === 'email') {
      if (!RESEND_API_KEY) {
        emailError = 'Email service not configured (missing API key)';
        console.error(emailError);
      } else {
        try {
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
            emailError = `Email provider error (${emailRes.status}): ${errBody}`;
          } else {
            emailSent = true;
          }
        } catch (fetchErr) {
          emailError = `Network error sending email: ${fetchErr.message}`;
          console.error(emailError);
        }
      }
    }

    // Always log notification — even on failure
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
        metadata: {
          ...(payload.metadata || {}),
          email_sent: emailSent,
          email_error: emailError || undefined,
        },
        idempotency_key: payload.idempotency_key || null,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('Insert error:', insertErr);
    }

    // If email failed, return error but notification is still logged
    if (canal === 'email' && !emailSent) {
      return new Response(JSON.stringify({
        success: false,
        email_sent: false,
        email_error: emailError,
        notification_logged: !!notif,
        notification_id: notif?.id,
        error_code: 'email_send_failed',
      }), {
        status: 200, // 200 because the notification was logged successfully
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
    return new Response(JSON.stringify({ error: err.message, error_code: 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
