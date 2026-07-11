const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_APP_URL = Deno.env.get('PUBLIC_APP_URL') || 'https://reybaud-app.com';

const SENDER_DOMAIN = 'notify.reybaud-app.com';
const FROM_NAME = 'Reybaud Ciclismo';

interface Payload {
  survey_id?: string;
  event_id?: string;
  scheduled?: boolean; // called from cron
  force?: boolean;
  enviado_por?: string | null;
  test_email?: string; // if set: only sends preview to this address, no state changes
  test_name?: string;
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

interface AlbumConfig {
  mostrar: boolean;
  titulo?: string | null;
  url?: string | null;
  cover?: string | null;
  mensaje?: string | null;
  ctaLabel?: string | null;
}

const wrapHtml = (
  eventName: string,
  title: string,
  name: string,
  description: string,
  link: string,
  album: AlbumConfig,
  isTest = false,
) => {
  const albumBlock = album.mostrar && album.url
    ? `
    <div style="background:#0b1220;border-radius:14px;padding:0;overflow:hidden;margin-bottom:22px;">
      ${album.cover ? `<a href="${album.url}" style="display:block;"><img src="${album.cover}" alt="${album.titulo || 'Álbum del viaje'}" style="display:block;width:100%;height:auto;max-height:280px;object-fit:cover;border:0;"/></a>` : ''}
      <div style="padding:22px 24px;color:#f5f5f5;">
        <div style="font-size:11px;letter-spacing:.22em;color:#06b6d4;text-transform:uppercase;margin-bottom:8px;">📸 Álbum de fotos</div>
        <h2 style="margin:0 0 10px;font-size:20px;color:#fff;font-weight:700;">${album.titulo || 'Las fotos del viaje ya están acá'}</h2>
        ${album.mensaje ? `<p style="margin:0 0 16px;color:#d4d4d8;font-size:14px;line-height:1.55;">${album.mensaje}</p>` : ''}
        <div>
          <a href="${album.url}" style="display:inline-block;background:#06b6d4;color:#0b1220;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">${album.ctaLabel || 'Ver el álbum completo'}</a>
        </div>
      </div>
    </div>`
    : '';

  const testBanner = isTest
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;color:#78350f;padding:10px 14px;border-radius:10px;margin-bottom:16px;font-size:13px;text-align:center;">⚠️ Envío de prueba · Este mail no se registró como enviado a los participantes.</div>`
    : '';

  return `
<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;font-family:Inter,Arial,sans-serif;color:#111;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    ${testBanner}
    <div style="border-left:3px solid #f97316;padding-left:14px;margin-bottom:22px;">
      <div style="font-size:12px;letter-spacing:.18em;color:#06b6d4;text-transform:uppercase;">${eventName}</div>
      <h1 style="margin:6px 0 0;font-size:24px;color:#111;font-weight:700;">${title}</h1>
    </div>
    ${albumBlock}
    <div style="background:#fafafa;border:1px solid #e5e5e5;border-radius:14px;padding:24px;line-height:1.6;color:#222;font-size:15px;">
      <p style="margin:0 0 12px;">Hola ${name || 'ciclista'},</p>
      <p style="margin:0 0 12px;">${description || 'Nos encantaría conocer tu experiencia y qué podemos mejorar para los próximos camps. Tu opinión es clave.'}</p>
      <p style="margin:0 0 22px;">Son solo 3-5 minutos. Podés responder desde el celu.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${link}" style="display:inline-block;background:#f97316;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:16px;">Responder encuesta</a>
      </div>
      <p style="margin:0;font-size:13px;color:#666;">Si el botón no funciona, copiá y pegá este link: <br/><a href="${link}" style="color:#06b6d4;word-break:break-all;">${link}</a></p>
    </div>
    <div style="margin-top:20px;color:#737373;font-size:12px;text-align:center;">
      Reybaud Ciclismo &middot; Gracias por ser parte.
    </div>
  </div>
</body></html>`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload: Payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Cron mode: process all surveys scheduled for now or before, not sent yet
    if (payload.scheduled) {
      const { data: due } = await supabase
        .from('event_surveys')
        .select('id')
        .lte('fecha_envio_programada', new Date().toISOString())
        .is('enviada_at', null)
        .eq('activa', true);
      const results: any[] = [];
      for (const s of due || []) {
        const r = await processSurvey(supabase, (s as any).id, false);
        results.push({ survey_id: (s as any).id, ...r });
      }
      return new Response(JSON.stringify({ scheduled_run: true, processed: results.length, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!payload.survey_id) {
      return new Response(JSON.stringify({ error: 'survey_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Test-send mode: only one recipient, no state mutations
    if (payload.test_email) {
      const result = await sendTestSurvey(supabase, payload.survey_id, payload.test_email, payload.test_name);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await processSurvey(supabase, payload.survey_id, !!payload.force);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('send-event-survey error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processSurvey(supabase: any, surveyId: string, force: boolean) {
  const { data: survey } = await supabase
    .from('event_surveys')
    .select('*, events(title)')
    .eq('id', surveyId)
    .maybeSingle();
  if (!survey) return { error: 'Survey not found' };
  if (survey.enviada_at && !force) return { error: 'Already sent', sent: 0 };

  const eventName = survey.events?.title || 'Evento';

  // Gather recipients from reservations
  const { data: reservations } = await supabase
    .from('event_reservations')
    .select('id, alumno_id, external_participant_id, reservation_status')
    .eq('event_id', survey.event_id)
    .in('reservation_status', ['reserva_confirmada', 'solicitud_enviada', 'reserva_pendiente']);

  const alumnoIds = [...new Set((reservations || []).map((r: any) => r.alumno_id).filter(Boolean))];
  const externalIds = [...new Set((reservations || []).map((r: any) => r.external_participant_id).filter(Boolean))];

  const alumnosMap = new Map<string, any>();
  if (alumnoIds.length) {
    const { data } = await supabase.from('alumnos').select('id, email, nombre, apellido').in('id', alumnoIds);
    (data || []).forEach((a: any) => alumnosMap.set(a.id, a));
  }
  const extMap = new Map<string, any>();
  if (externalIds.length) {
    const { data } = await supabase.from('event_external_participants').select('id, email, nombre, apellido').in('id', externalIds);
    (data || []).forEach((e: any) => extMap.set(e.id, e));
  }

  type Recip = { email: string; name: string; alumno_id: string | null; external_id: string | null };
  const recipients: Recip[] = [];
  const seen = new Set<string>();
  for (const r of reservations || []) {
    let email = '', name = '', alumno_id: string | null = null, external_id: string | null = null;
    if (r.alumno_id && alumnosMap.has(r.alumno_id)) {
      const a = alumnosMap.get(r.alumno_id);
      email = a.email; name = `${a.nombre} ${a.apellido || ''}`.trim(); alumno_id = a.id;
    } else if (r.external_participant_id && extMap.has(r.external_participant_id)) {
      const e = extMap.get(r.external_participant_id);
      email = e.email; name = `${e.nombre} ${e.apellido || ''}`.trim(); external_id = e.id;
    }
    if (!email) continue;
    const norm = normalizeEmail(email);
    if (seen.has(norm)) continue;
    seen.add(norm);
    recipients.push({ email, name, alumno_id, external_id });
  }

  if (recipients.length === 0) return { sent: 0, message: 'No recipients' };

  let sent = 0, failed = 0;
  for (const r of recipients) {
    // Create or fetch token
    let token: string;
    const { data: existingToken } = await supabase
      .from('event_survey_tokens')
      .select('token')
      .eq('survey_id', surveyId)
      .eq('recipient_email', normalizeEmail(r.email))
      .maybeSingle();

    if (existingToken?.token) {
      token = existingToken.token;
    } else {
      const { data: newTok } = await supabase
        .from('event_survey_tokens')
        .insert({
          survey_id: surveyId,
          event_id: survey.event_id,
          alumno_id: r.alumno_id,
          external_participant_id: r.external_id,
          recipient_email: normalizeEmail(r.email),
          recipient_name: r.name,
        })
        .select('token')
        .single();
      token = newTok?.token || '';
    }
    if (!token) { failed++; continue; }

    const link = `${PUBLIC_APP_URL}/encuesta/${token}`;
    const idemKey = `event-survey-${surveyId}-${normalizeEmail(r.email)}`;

    try {
      const messageId = crypto.randomUUID();
      const unsubToken = await getOrCreateUnsubscribeToken(supabase, r.email);
      const subject = `${eventName} · ${survey.titulo}`;
      const albumCfg: AlbumConfig = {
        mostrar: !!survey.mostrar_album,
        titulo: survey.album_titulo,
        url: survey.album_url,
        cover: survey.album_cover_image_url,
        mensaje: survey.album_mensaje,
        ctaLabel: survey.album_cta_label,
      };
      const html = wrapHtml(eventName, survey.titulo, r.name.split(' ')[0] || '', survey.descripcion || '', link, albumCfg);
      const text = `Hola ${r.name}, ${survey.descripcion || 'Nos gustaría conocer tu experiencia.'} Responder: ${link}`;

      const { error: enqErr } = await supabase.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          message_id: messageId,
          to: r.email,
          from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text,
          purpose: 'transactional',
          label: 'event_survey',
          idempotency_key: idemKey,
          unsubscribe_token: unsubToken,
          queued_at: new Date().toISOString(),
        },
      });
      if (enqErr) { failed++; continue; }
      sent++;
    } catch (e) {
      console.error('send-event-survey per-recipient error:', e);
      failed++;
    }
  }

  await supabase
    .from('event_surveys')
    .update({
      enviada_at: new Date().toISOString(),
      recipients_count: sent,
    })
    .eq('id', surveyId);

  return { sent, failed, total: recipients.length };
}
