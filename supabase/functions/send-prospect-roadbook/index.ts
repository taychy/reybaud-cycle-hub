// Envía el link teaser del roadbook a un prospecto vía la cola transaccional.
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

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const getOrCreateUnsubscribeToken = async (supabase: any, email: string) => {
  const norm = normalizeEmail(email);
  const { data: existing } = await supabase.from('email_unsubscribe_tokens').select('token').eq('email', norm).maybeSingle();
  if (existing?.token) return existing.token;
  const newToken = crypto.randomUUID();
  const { data: inserted, error } = await supabase.from('email_unsubscribe_tokens').insert({ email: norm, token: newToken }).select('token').single();
  if (!error && inserted?.token) return inserted.token;
  const { data: fb } = await supabase.from('email_unsubscribe_tokens').select('token').eq('email', norm).maybeSingle();
  if (fb?.token) return fb.token;
  throw error ?? new Error('Could not create unsubscribe token');
};

const esc = (s: any) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const buildHtml = ({ nombre, eventTitle, fechas, recorrido, dias, link }: {
  nombre: string; eventTitle: string; fechas: string; recorrido: string;
  dias: Array<{ numero: string; titulo: string; fecha: string; km: string; desnivel: string }>;
  link: string;
}) => {
  const O = '#f97316', C = '#06b6d4', TEXT = '#111', MUTED = '#737373';
  const itin = dias.slice(0, 6).map((d) => `
    <tr>
      <td style="padding:8px 6px;color:${O};font-weight:700;width:26px;">${esc(d.numero)}</td>
      <td style="padding:8px 6px;color:${TEXT};">${esc(d.titulo)}</td>
      <td style="padding:8px 6px;color:${MUTED};white-space:nowrap;">${esc(d.fecha)}</td>
      <td style="padding:8px 6px;color:${C};text-align:right;white-space:nowrap;">${esc(d.km)} km</td>
    </tr>`).join('');
  const more = dias.length > 6 ? `<tr><td colspan="4" style="padding:8px 6px;color:${MUTED};font-size:12px;text-align:center;">+ ${dias.length - 6} días más en el link</td></tr>` : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;font-family:Inter,Arial,sans-serif;color:${TEXT};">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="font-size:11px;letter-spacing:.22em;color:${O};text-transform:uppercase;font-weight:700;">Vista teaser · Roadbook</div>
    <h1 style="margin:6px 0 4px;font-size:26px;font-weight:700;line-height:1.2;">${esc(eventTitle)}</h1>
    ${fechas ? `<p style="margin:0 0 4px;color:${MUTED};font-size:14px;">${esc(fechas)}</p>` : ''}
    ${recorrido ? `<p style="margin:0 0 18px;color:${MUTED};font-size:14px;">${esc(recorrido)}</p>` : ''}

    <p style="margin:14px 0 8px;font-size:15px;">Hola ${esc(nombre)},</p>
    <p style="margin:0 0 18px;color:#444;font-size:15px;line-height:1.6;">
      Te compartimos un resumen del viaje: itinerario, fechas y km por día. Es un link privado y personal para vos.
    </p>

    ${dias.length ? `
    <div style="border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;margin:16px 0 22px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        <tbody>${itin}${more}</tbody>
      </table>
    </div>` : ''}

    <div style="text-align:center;margin:6px 0 8px;">
      <a href="${link}" style="display:inline-block;width:100%;box-sizing:border-box;background:${O};color:#fff;padding:16px 24px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;">Ver detalles del viaje ↗</a>
    </div>
    <p style="margin:12px 0 0;font-size:12px;color:${MUTED};text-align:center;">
      Si el botón no funciona, copiá este link: <a href="${link}" style="color:${C};word-break:break-all;">${link}</a>
    </p>

    <p style="margin:24px 0 0;font-size:13px;color:${MUTED};text-align:center;line-height:1.55;">
      ¿Preguntas? Respondé este mail o escribinos por WhatsApp.
    </p>
    <div style="margin-top:24px;color:#a3a3a3;font-size:12px;text-align:center;">Reybaud Ciclismo</div>
  </div>
</body></html>`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { link_id } = await req.json().catch(() => ({}));
    if (!link_id) {
      return new Response(JSON.stringify({ error: 'link_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: link } = await supabase
      .from('roadbook_prospect_links')
      .select('*, events(titulo, roadbook)')
      .eq('id', link_id)
      .maybeSingle();
    if (!link) {
      return new Response(JSON.stringify({ error: 'Link not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const rb = ((link as any).events?.roadbook || {}) as any;
    const eventTitle = (link as any).events?.titulo || 'Camp';
    const url = `${PUBLIC_APP_URL}/roadbook/${(link as any).token}`;
    const dias = Array.isArray(rb.dias) ? rb.dias : [];

    const html = buildHtml({
      nombre: (link as any).nombre || 'ciclista',
      eventTitle,
      fechas: rb.fechas_label || '',
      recorrido: rb.recorrido_label || '',
      dias: dias.map((d: any) => ({
        numero: String(d?.numero ?? ''),
        titulo: String(d?.titulo ?? ''),
        fecha: String(d?.fecha ?? ''),
        km: String(d?.km ?? ''),
        desnivel: String(d?.desnivel ?? ''),
      })),
      link: url,
    });
    const text = `Hola ${(link as any).nombre}, te comparto el roadbook de ${eventTitle}: ${url}`;
    const subject = `${eventTitle} · Roadbook del viaje`;
    const messageId = crypto.randomUUID();
    const unsubToken = await getOrCreateUnsubscribeToken(supabase, (link as any).email);
    const idemKey = `prospect-link-${(link as any).id}`;

    const { error: enqErr } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: (link as any).email,
        from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: 'roadbook_prospect',
        idempotency_key: idemKey,
        unsubscribe_token: unsubToken,
        queued_at: new Date().toISOString(),
      },
    });
    if (enqErr) {
      return new Response(JSON.stringify({ error: 'Enqueue failed', details: enqErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ sent: 1, to: (link as any).email }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('send-prospect-roadbook error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
