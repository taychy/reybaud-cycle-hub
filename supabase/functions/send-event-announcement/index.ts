const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SENDER_DOMAIN = 'notify.reybaud-app.com';
const FROM_NAME = 'Reybaud Ciclismo';

interface Filters {
  package_ids?: string[] | null;
  payment_statuses?: string[] | null;
  reservation_statuses?: string[] | null;
  reservation_ids?: string[] | null;
  include_externals?: boolean;
}

interface Payload {
  event_id: string;
  announcement_id?: string | null;
  // Manual override
  subject?: string;
  body_html?: string;
  body_text?: string;
  filters?: Filters;
  enviado_por?: string;
  enviado_por_email?: string;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const getOrCreateUnsubscribeToken = async (supabase: any, email: string) => {
  const normalizedEmail = normalizeEmail(email);
  const { data: existing } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (existing?.token) return existing.token;
  const newToken = crypto.randomUUID();
  const { data: inserted, error } = await supabase
    .from('email_unsubscribe_tokens')
    .insert({ email: normalizedEmail, token: newToken })
    .select('token')
    .single();
  if (!error && inserted?.token) return inserted.token;
  const { data: fallback } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (fallback?.token) return fallback.token;
  throw error ?? new Error('Could not create unsubscribe token');
};

const wrapHtml = (eventName: string, title: string, bodyHtml: string) => `
<!doctype html>
<html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,Arial,sans-serif;color:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;">
    <div style="border-left:3px solid #f97316;padding-left:14px;margin-bottom:18px;">
      <div style="font-size:12px;letter-spacing:.18em;color:#06b6d4;text-transform:uppercase;">${eventName}</div>
      <h1 style="margin:6px 0 0;font-size:22px;color:#fff;font-weight:600;">${title}</h1>
    </div>
    <div style="background:#141414;border:1px solid #262626;border-radius:14px;padding:22px;line-height:1.55;color:#e5e5e5;font-size:15px;">
      ${bodyHtml}
    </div>
    <div style="margin-top:20px;color:#737373;font-size:12px;text-align:center;">
      Reybaud Ciclismo &middot; Novedad del evento
    </div>
  </div>
</body></html>`;

const stripHtml = (html: string) => html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>/gi, '\n\n')
  .replace(/<[^>]+>/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload: Payload = await req.json();
    if (!payload.event_id) {
      return new Response(JSON.stringify({ error: 'event_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch event
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('id, title')
      .eq('id', payload.event_id)
      .maybeSingle();
    if (eventErr || !event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const eventName = (event as any).title || 'Evento';

    // Resolve subject/body
    let subject = payload.subject || '';
    let bodyHtml = payload.body_html || '';
    let announcementTitle = subject;

    if (payload.announcement_id) {
      const { data: ann } = await supabase
        .from('event_announcements')
        .select('id, title, content')
        .eq('id', payload.announcement_id)
        .maybeSingle();
      if (!ann) {
        return new Response(JSON.stringify({ error: 'Announcement not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      announcementTitle = (ann as any).title;
      subject = subject || `${eventName} · ${(ann as any).title}`;
      bodyHtml = bodyHtml || `<p>${String((ann as any).content).replace(/\n/g, '<br/>')}</p>`;
    }

    if (!subject || !bodyHtml) {
      return new Response(JSON.stringify({ error: 'subject and body required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const filters: Filters = payload.filters || {};
    const includeExternals = filters.include_externals !== false;

    // Fetch reservations (active only by default)
    let resQuery = supabase
      .from('event_reservations')
      .select('id, alumno_id, external_participant_id, package_id, payment_status, reservation_status')
      .eq('event_id', payload.event_id);

    const resStatuses = filters.reservation_statuses && filters.reservation_statuses.length
      ? filters.reservation_statuses
      : ['reserva_confirmada', 'solicitud_enviada', 'reserva_pendiente'];
    resQuery = resQuery.in('reservation_status', resStatuses);

    if (filters.reservation_ids && filters.reservation_ids.length) {
      resQuery = resQuery.in('id', filters.reservation_ids);
    }
    if (filters.package_ids && filters.package_ids.length) {
      resQuery = resQuery.in('package_id', filters.package_ids);
    }
    if (filters.payment_statuses && filters.payment_statuses.length) {
      resQuery = resQuery.in('payment_status', filters.payment_statuses);
    }

    const { data: reservations, error: resErr } = await resQuery;
    if (resErr) throw resErr;

    // Resolve recipients
    type Recip = { email: string; name: string; reservation_id: string; alumno_id: string | null };
    const recipients: Recip[] = [];
    const seen = new Set<string>();

    const alumnoIds = [...new Set((reservations || []).map((r: any) => r.alumno_id).filter(Boolean))];
    let alumnosMap = new Map<string, any>();
    if (alumnoIds.length) {
      const { data: alumnos } = await supabase
        .from('alumnos')
        .select('id, email, nombre, apellido')
        .in('id', alumnoIds);
      (alumnos || []).forEach((a: any) => alumnosMap.set(a.id, a));
    }

    const externalIds = [...new Set((reservations || []).map((r: any) => r.external_participant_id).filter(Boolean))];
    let externalsMap = new Map<string, any>();
    if (includeExternals && externalIds.length) {
      const { data: exts } = await supabase
        .from('event_external_participants')
        .select('id, email, nombre, apellido')
        .in('id', externalIds);
      (exts || []).forEach((e: any) => externalsMap.set(e.id, e));
    }

    for (const r of reservations || []) {
      let email = '', name = '';
      if (r.alumno_id && alumnosMap.has(r.alumno_id)) {
        const a = alumnosMap.get(r.alumno_id);
        email = a.email; name = `${a.nombre} ${a.apellido || ''}`.trim();
      } else if (includeExternals && r.external_participant_id && externalsMap.has(r.external_participant_id)) {
        const e = externalsMap.get(r.external_participant_id);
        email = e.email; name = `${e.nombre} ${e.apellido || ''}`.trim();
      }
      if (!email) continue;
      const norm = normalizeEmail(email);
      if (seen.has(norm)) continue;
      seen.add(norm);
      recipients.push({ email, name, reservation_id: r.id, alumno_id: r.alumno_id });
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No recipients matched filters' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const wrappedHtml = wrapHtml(eventName, announcementTitle || subject, bodyHtml);
    const bodyText = payload.body_text || stripHtml(bodyHtml);

    let sent = 0, failed = 0;
    const idemBase = payload.announcement_id
      ? `announcement-${payload.announcement_id}`
      : `manual-${payload.event_id}-${Date.now()}`;

    for (const r of recipients) {
      const idemKey = `${idemBase}-${normalizeEmail(r.email)}`;

      // Idempotency check
      const { data: existing } = await supabase
        .from('reservation_notifications')
        .select('id')
        .eq('idempotency_key', idemKey)
        .maybeSingle();
      if (existing) { sent++; continue; }

      let emailSent = false;
      let emailError: string | null = null;
      try {
        const messageId = crypto.randomUUID();
        const unsubToken = await getOrCreateUnsubscribeToken(supabase, r.email);
        const { error: enqErr } = await supabase.rpc('enqueue_email', {
          queue_name: 'transactional_emails',
          payload: {
            message_id: messageId,
            to: r.email,
            from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject,
            html: wrappedHtml,
            text: bodyText,
            purpose: 'transactional',
            label: payload.announcement_id ? 'event_announcement' : 'event_manual',
            idempotency_key: idemKey,
            unsubscribe_token: unsubToken,
            queued_at: new Date().toISOString(),
          },
        });
        if (enqErr) emailError = enqErr.message;
        else emailSent = true;
      } catch (e: any) {
        emailError = e.message;
      }

      await supabase.from('reservation_notifications').insert({
        reservation_id: r.reservation_id,
        alumno_id: r.alumno_id,
        tipo: 'novedad',
        canal: 'email',
        asunto: subject,
        contenido: bodyText,
        enviado_por: payload.enviado_por || null,
        enviado_por_email: payload.enviado_por_email || null,
        metadata: {
          announcement_id: payload.announcement_id || null,
          email_sent: emailSent,
          email_error: emailError || undefined,
          filters,
        },
        idempotency_key: idemKey,
      });

      if (emailSent) sent++; else failed++;
    }

    // Update announcement counters
    if (payload.announcement_id) {
      await supabase
        .from('event_announcements')
        .update({
          email_sent_at: new Date().toISOString(),
          email_recipients_count: sent,
        })
        .eq('id', payload.announcement_id);
    }

    return new Response(JSON.stringify({ success: true, sent, failed, total: recipients.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('send-event-announcement error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
