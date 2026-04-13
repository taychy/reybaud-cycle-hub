const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SENDER_DOMAIN = 'notify.reybaud-app.com';
const FROM_NAME = 'Reybaud Ciclismo';

interface NotifyPayload {
  reservation_id: string;
  alumno_id?: string | null;
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

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const getOrCreateUnsubscribeToken = async (supabase: any, email: string) => {
  const normalizedEmail = normalizeEmail(email);

  const { data: existingToken, error: existingError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingToken?.token) return existingToken.token;

  const newToken = crypto.randomUUID();

  const { data: insertedToken, error: insertError } = await supabase
    .from('email_unsubscribe_tokens')
    .insert({ email: normalizedEmail, token: newToken })
    .select('token')
    .single();

  if (!insertError && insertedToken?.token) {
    return insertedToken.token;
  }

  const { data: fallbackToken, error: fallbackError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (fallbackError) throw fallbackError;
  if (fallbackToken?.token) return fallbackToken.token;

  throw insertError ?? new Error('Could not create unsubscribe token');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: NotifyPayload = await req.json();

    if (!payload.reservation_id || !payload.tipo || !payload.asunto || !payload.contenido_html) {
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

    // Send email if canal is email — via Lovable email queue
    if (canal === 'email') {
      try {
        const messageId = crypto.randomUUID();
        const unsubscribeToken = await getOrCreateUnsubscribeToken(supabase, recipientEmail);
        const emailPayload = {
          message_id: messageId,
          to: recipientEmail,
          from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject: payload.asunto,
          html: payload.contenido_html,
          text: payload.contenido_texto || '',
          purpose: 'transactional',
          label: `reservation_${payload.tipo}`,
          idempotency_key: payload.idempotency_key || messageId,
          unsubscribe_token: unsubscribeToken,
          queued_at: new Date().toISOString(),
        };

        const { error: enqueueErr } = await supabase.rpc('enqueue_email', {
          queue_name: 'transactional_emails',
          payload: emailPayload,
        });

        if (enqueueErr) {
          emailError = `Queue error: ${enqueueErr.message}`;
          console.error(emailError);
        } else {
          emailSent = true;
        }
      } catch (queueErr) {
        emailError = `Queue exception: ${queueErr.message}`;
        console.error(emailError);
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
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      email_sent: emailSent,
      notification_id: notif?.id,
      recipient: recipientEmail,
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
