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

interface DescuentoConfig {
  activo: boolean;
  porcentaje?: number | null;
  titulo?: string | null;
  mensaje?: string | null;
  ctaLabel?: string | null;
  url?: string | null;
}

const formatDeadline = (iso: string | null | undefined) => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `${d.getDate()} de ${meses[d.getMonth()]}`;
  } catch { return null; }
};

const wrapHtml = (
  eventName: string,
  title: string,
  name: string,
  description: string,
  link: string,
  album: AlbumConfig,
  descuento: DescuentoConfig,
  deadlineIso: string | null | undefined,
  isTest = false,
) => {
  const deadlineLabel = formatDeadline(deadlineIso);
  const deadlineBlock = deadlineLabel
    ? `<div style="background:#0b1220;border:1px solid #1e293b;border-radius:12px;padding:14px 18px;margin:0 0 14px;display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;line-height:1;">🕒</span>
        <span style="color:#06b6d4;font-size:14px;font-weight:600;letter-spacing:.02em;">Respondé antes del ${deadlineLabel}</span>
      </div>`
    : '';

  const descuentoBlock = descuento.activo && descuento.url
    ? `<div style="background:#fafafa;border:1px solid #e5e5e5;border-radius:14px;padding:22px 24px;margin-top:18px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:20px;line-height:1;">🏷️</span>
          <h3 style="margin:0;font-size:17px;color:#111;font-weight:700;">${descuento.titulo || `${descuento.porcentaje || 10}% off tu próximo camp`}</h3>
        </div>
        <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.55;">${descuento.mensaje || 'Anotate ahora y asegurate el lugar con descuento.'}</p>
        <div>
          <a href="${descuento.url}" style="display:inline-block;background:#ffffff;border:1px solid #d4d4d8;color:#111;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">${descuento.ctaLabel || 'Anotarme con descuento'} ↗</a>
        </div>
      </div>`
    : '';

  const albumBlock = album.mostrar && album.url
    ? `<div style="margin-top:28px;">
        <div style="font-size:11px;letter-spacing:.22em;color:#737373;text-transform:uppercase;margin-bottom:10px;">Álbum de fotos</div>
        <a href="${album.url}" style="display:block;text-decoration:none;color:inherit;">
          ${album.cover
            ? `<img src="${album.cover}" alt="${album.titulo || 'Álbum del viaje'}" style="display:block;width:100%;height:auto;max-height:260px;object-fit:cover;border-radius:12px;border:0;margin-bottom:10px;"/>`
            : ''}
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <p style="margin:0;color:#111;font-size:15px;font-weight:600;">${album.titulo || 'Las fotos del viaje ya están acá'}</p>
            <span style="color:#06b6d4;font-size:14px;">${album.ctaLabel || 'Ver álbum'} →</span>
          </div>
          ${album.mensaje ? `<p style="margin:6px 0 0;color:#737373;font-size:13px;">${album.mensaje}</p>` : ''}
        </a>
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
    <div style="margin-bottom:22px;">
      <div style="font-size:12px;letter-spacing:.18em;color:#06b6d4;text-transform:uppercase;">${eventName}</div>
      <h1 style="margin:6px 0 0;font-size:26px;color:#111;font-weight:700;line-height:1.2;">${title}</h1>
    </div>

    <p style="margin:0 0 10px;color:#111;font-size:15px;">Hola ${name || 'ciclista'},</p>
    <p style="margin:0 0 22px;color:#444;font-size:15px;line-height:1.6;">${description || 'Nos encantaría conocer tu experiencia para mejorar los próximos camps. Son 3-5 minutos, podés responder desde el celu.'}</p>

    ${deadlineBlock}

    <div style="text-align:center;margin:6px 0 8px;">
      <a href="${link}" style="display:inline-block;width:100%;box-sizing:border-box;background:#f97316;color:#fff;padding:16px 24px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;">Responder encuesta ↗</a>
    </div>
    <p style="margin:12px 0 0;font-size:12px;color:#737373;text-align:center;">Si el botón no funciona, copiá este link: <a href="${link}" style="color:#06b6d4;word-break:break-all;">${link}</a></p>

    ${descuentoBlock}
    ${albumBlock}

    <div style="margin-top:28px;color:#a3a3a3;font-size:12px;text-align:center;">
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
      const descuentoCfg: DescuentoConfig = {
        activo: !!survey.descuento_activo,
        porcentaje: survey.descuento_porcentaje,
        titulo: survey.descuento_titulo,
        mensaje: survey.descuento_mensaje,
        ctaLabel: survey.descuento_cta_label,
        url: survey.descuento_url,
      };
      const html = wrapHtml(eventName, survey.titulo, r.name.split(' ')[0] || '', survey.descripcion || '', link, albumCfg, descuentoCfg, survey.fecha_limite_respuesta);
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

async function sendTestSurvey(supabase: any, surveyId: string, testEmail: string, testName?: string) {
  const { data: survey } = await supabase
    .from('event_surveys')
    .select('*, events(title)')
    .eq('id', surveyId)
    .maybeSingle();
  if (!survey) return { error: 'Survey not found' };

  const eventName = survey.events?.title || 'Evento';
  const email = normalizeEmail(testEmail);
  const displayName = testName?.trim() || 'Prueba';

  // Reuse-or-create a token so el link funcione realmente en el preview
  let token = '';
  const { data: existingToken } = await supabase
    .from('event_survey_tokens')
    .select('token')
    .eq('survey_id', surveyId)
    .eq('recipient_email', email)
    .maybeSingle();
  if (existingToken?.token) {
    token = existingToken.token;
  } else {
    const { data: newTok, error: tokErr } = await supabase
      .from('event_survey_tokens')
      .insert({
        survey_id: surveyId,
        event_id: survey.event_id,
        recipient_email: email,
        recipient_name: displayName,
      })
      .select('token')
      .single();
    if (tokErr) return { error: 'Token error', details: tokErr.message };
    token = newTok?.token || '';
  }
  if (!token) return { error: 'Could not create token' };

  const link = `${PUBLIC_APP_URL}/encuesta/${token}`;
  const albumCfg: AlbumConfig = {
    mostrar: !!survey.mostrar_album,
    titulo: survey.album_titulo,
    url: survey.album_url,
    cover: survey.album_cover_image_url,
    mensaje: survey.album_mensaje,
    ctaLabel: survey.album_cta_label,
  };
  const descuentoCfg: DescuentoConfig = {
    activo: !!survey.descuento_activo,
    porcentaje: survey.descuento_porcentaje,
    titulo: survey.descuento_titulo,
    mensaje: survey.descuento_mensaje,
    ctaLabel: survey.descuento_cta_label,
    url: survey.descuento_url,
  };

  const messageId = crypto.randomUUID();
  const unsubToken = await getOrCreateUnsubscribeToken(supabase, testEmail);
  const subject = `[PRUEBA] ${eventName} · ${survey.titulo}`;
  const html = wrapHtml(eventName, survey.titulo, displayName.split(' ')[0], survey.descripcion || '', link, albumCfg, descuentoCfg, survey.fecha_limite_respuesta, true);
  const text = `[PRUEBA] Hola ${displayName}, ${survey.descripcion || ''} Responder: ${link}`;

  const { error: enqErr } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: testEmail,
      from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: 'event_survey_test',
      idempotency_key: `event-survey-test-${surveyId}-${email}-${Date.now()}`,
      unsubscribe_token: unsubToken,
      queued_at: new Date().toISOString(),
    },
  });
  if (enqErr) return { error: 'Enqueue failed', details: enqErr.message };
  return { test: true, sent: 1, to: testEmail };
}
