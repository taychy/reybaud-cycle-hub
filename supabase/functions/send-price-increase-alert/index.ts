// deno-lint-ignore-file no-explicit-any
/**
 * Aviso "sube el precio en 24h" para eventos.
 *
 * Body:
 *   { mode: 'test' | 'send', event_id?: uuid, test_email?: string }
 *
 * mode='test'  → arma la lista real pero envía UN mail solo a test_email
 *                (con [TEST] en el asunto y una nota al pie con el listado).
 * mode='send'  → envía a: reservas con saldo > 0 + alumnos que marcaron favorito.
 *
 * Si event_id se omite, procesa todos los eventos con un cambio de etapa
 * activo en las próximas 24h. Cada envío usa idempotency_key por
 * (event, stage, recipient) para no duplicar.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SENDER_DOMAIN = 'notify.reybaud-app.com';
const FROM_NAME = 'Reybaud Ciclismo';
const APP_URL = 'https://reybaud-app.com';
const BRAND = '#FF6B1A';

function fmtMoney(n: number, currency: string): string {
  try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n); }
  catch { return `${currency} ${Math.round(n)}`; }
}
function fmtDateAR(d: Date): string {
  const s = new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const [date, time] = s.split('T');
  const [y, m, dd] = date.split('-');
  return `${dd}/${m}/${y} ${time.slice(0,5)} hs`;
}
function escapeHtml(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}
const normalize = (e: string) => e.trim().toLowerCase();

async function getOrCreateUnsubscribeToken(supabase: any, email: string): Promise<string> {
  const e = normalize(email);
  const { data: ex } = await supabase.from('email_unsubscribe_tokens').select('token').eq('email', e).maybeSingle();
  if (ex?.token) return ex.token;
  const t = crypto.randomUUID();
  const { data: ins, error } = await supabase.from('email_unsubscribe_tokens').insert({ email: e, token: t }).select('token').single();
  if (!error && ins?.token) return ins.token;
  const { data: fb } = await supabase.from('email_unsubscribe_tokens').select('token').eq('email', e).maybeSingle();
  if (fb?.token) return fb.token;
  throw error ?? new Error('Could not create unsubscribe token');
}

async function enqueue(supabase: any, to: string, subject: string, html: string, idempotencyKey: string) {
  const unsub = await getOrCreateUnsubscribeToken(supabase, to);
  const payload = {
    message_id: crypto.randomUUID(),
    to,
    from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
    sender_domain: SENDER_DOMAIN,
    subject,
    html,
    text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000),
    purpose: 'transactional',
    label: 'price_increase_alert',
    idempotency_key: idempotencyKey,
    queued_at: new Date().toISOString(),
    unsubscribe_token: unsub,
  };
  const { error } = await supabase.rpc('enqueue_email', { queue_name: 'transactional_emails', payload });
  if (error) throw error;
}

function renderEmail(opts: {
  nombre: string; eventTitle: string; stageName: string;
  vigenteDesde: Date; oldMin: number | null; newMin: number; currency: string;
  hasReservation: boolean; balanceDue: number | null; testFooter?: string;
}): string {
  const { nombre, eventTitle, stageName, vigenteDesde, oldMin, newMin, currency, hasReservation, balanceDue, testFooter } = opts;
  const diff = oldMin && oldMin > 0 ? Math.round(((newMin - oldMin) / oldMin) * 100) : null;
  const ctaHref = hasReservation ? `${APP_URL}/mis-reservas` : `${APP_URL}/eventos`;
  const ctaLabel = hasReservation ? 'Ir a mi reserva y pagar' : 'Reservar antes del aumento';

  const saldoBlock = hasReservation && balanceDue && balanceDue > 0
    ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;margin:16px 0;">
         <div style="font-size:12px;color:#9a3412;">Tu saldo pendiente</div>
         <div style="font-size:22px;font-weight:700;color:${BRAND};">${escapeHtml(fmtMoney(balanceDue, currency))}</div>
         <div style="font-size:12px;color:#7c2d12;margin-top:4px;">Si abonás antes del aumento, congelás el precio actual.</div>
       </div>`
    : '';

  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;padding:28px 22px;">
    <div style="border-top:4px solid ${BRAND};padding-top:22px;">
      <p style="margin:0 0 4px;color:${BRAND};font-weight:700;font-size:13px;letter-spacing:0.4px;">⏰ AVISO IMPORTANTE</p>
      <h1 style="font-size:22px;margin:0 0 10px;">Mañana sube el precio de <span style="color:${BRAND}">${escapeHtml(eventTitle)}</span></h1>
      <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.55;">
        Hola ${escapeHtml(nombre)}, te avisamos que el <b>${fmtDateAR(vigenteDesde)}</b> entra en vigencia
        la etapa <b>${escapeHtml(stageName)}</b>${diff && diff !== 0 ? ` (${diff > 0 ? '+' : ''}${diff}% aprox.)` : ''}.
      </p>

      <div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:16px;margin:12px 0;">
        <table style="width:100%;font-size:14px;">
          ${oldMin ? `<tr><td style="color:#777;padding:4px 0;">Precio actual (desde)</td><td style="text-align:right;padding:4px 0;">${escapeHtml(fmtMoney(oldMin, currency))}</td></tr>` : ''}
          <tr><td style="color:#777;padding:4px 0;">Precio nuevo (desde)</td><td style="text-align:right;padding:4px 0;font-weight:700;color:${BRAND};">${escapeHtml(fmtMoney(newMin, currency))}</td></tr>
          <tr><td style="color:#777;padding:4px 0;">Vigente desde</td><td style="text-align:right;padding:4px 0;">${fmtDateAR(vigenteDesde)}</td></tr>
        </table>
      </div>

      ${saldoBlock}

      <div style="text-align:center;margin:26px 0;">
        <a href="${ctaHref}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:14px 26px;border-radius:10px;font-weight:600;font-size:14px;">${ctaLabel}</a>
      </div>

      <p style="font-size:12px;color:#888;line-height:1.5;margin:22px 0 0;">
        Si ya pagaste el total, podés ignorar este aviso. Ante cualquier duda respondé este mail o escribinos por WhatsApp.
      </p>
      ${testFooter ? `<hr style="border:0;border-top:1px dashed #ccc;margin:22px 0 10px;"/><pre style="background:#f5f5f5;padding:10px;border-radius:6px;font-size:11px;color:#333;white-space:pre-wrap;">${escapeHtml(testFooter)}</pre>` : ''}
    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const mode: 'test' | 'send' = body.mode === 'send' ? 'send' : 'test';
    const requestedEventId: string | null = body.event_id || null;
    const testEmail: string | null = body.test_email || null;
    if (mode === 'test' && !testEmail) {
      return json({ error: 'test_email requerido cuando mode=test' }, 400);
    }

    const now = new Date();
    const in24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 1. Etapas activas que arrancan en las próximas 24h
    let stagesQ = supabase
      .from('event_package_price_stages')
      .select('id, package_id, nombre, precio, currency, vigente_desde, sort_order, activo, event_packages!inner(id, event_id, nombre, events!inner(id, title, status))')
      .eq('activo', true)
      .gt('vigente_desde', now.toISOString())
      .lte('vigente_desde', in24.toISOString())
      .order('vigente_desde', { ascending: true });

    const { data: stages, error: sErr } = await stagesQ;
    if (sErr) throw sErr;

    // agrupar por event_id, quedarnos con la etapa mínima (más barata) por evento
    const byEvent = new Map<string, { event: any; upcoming: any[] }>();
    for (const s of stages ?? []) {
      const evId = (s as any).event_packages.event_id;
      if (requestedEventId && evId !== requestedEventId) continue;
      const ev = (s as any).event_packages.events;
      if (!byEvent.has(evId)) byEvent.set(evId, { event: ev, upcoming: [] });
      byEvent.get(evId)!.upcoming.push(s);
    }

    const results: any[] = [];

    for (const [eventId, { event, upcoming }] of byEvent) {
      // precio "nuevo mínimo" y "vigente_desde" mínimo
      const currency = upcoming[0].currency || 'ARS';
      const newMin = Math.min(...upcoming.map((u: any) => Number(u.precio)));
      const vigenteDesde = new Date(upcoming.map((u: any) => u.vigente_desde).sort()[0]);
      const stageName = upcoming[0].nombre || 'Nueva etapa';

      // precio actual mínimo: etapa activa con vigente_desde <= now (última)
      const { data: currentStages } = await supabase
        .from('event_package_price_stages')
        .select('precio, vigente_desde, event_packages!inner(event_id)')
        .eq('activo', true)
        .lte('vigente_desde', now.toISOString())
        .eq('event_packages.event_id', eventId);
      const oldMin = currentStages && currentStages.length
        ? Math.min(...currentStages.map((c: any) => Number(c.precio)))
        : null;

      // 2. Destinatarios reales
      const recipientsMap = new Map<string, { nombre: string; hasReservation: boolean; balance: number | null }>();

      // reservas con saldo > 0 (no canceladas/rechazadas)
      const { data: reservas } = await supabase
        .from('event_reservations')
        .select('id, alumno_id, external_email, external_first_name, amount_paid, amount_total, balance_due, reservation_status, cancelled_at, alumnos(email, nombre)')
        .eq('event_id', eventId)
        .is('cancelled_at', null)
        .not('reservation_status', 'in', '(cancelada,rechazada)');
      for (const r of reservas ?? []) {
        const balance = r.balance_due != null ? Number(r.balance_due) : Math.max(0, Number(r.amount_total ?? 0) - Number(r.amount_paid ?? 0));
        if (balance <= 0) continue;
        const email = (r as any).alumnos?.email || r.external_email;
        const nombre = (r as any).alumnos?.nombre || r.external_first_name || 'Hola';
        if (!email) continue;
        const key = normalize(email);
        recipientsMap.set(key, { nombre, hasReservation: true, balance });
      }

      // favoritos
      const { data: favs } = await supabase
        .from('event_favorites')
        .select('alumno_id, alumnos(email, nombre)')
        .eq('event_id', eventId);
      for (const f of favs ?? []) {
        const email = (f as any).alumnos?.email;
        const nombre = (f as any).alumnos?.nombre || 'Hola';
        if (!email) continue;
        const key = normalize(email);
        if (!recipientsMap.has(key)) recipientsMap.set(key, { nombre, hasReservation: false, balance: null });
      }

      const recipientList = Array.from(recipientsMap.entries()).map(([email, v]) => ({ email, ...v }));

      // 3. Envío
      let sent = 0;
      const errors: string[] = [];

      if (mode === 'test') {
        const testFooter = `Modo test. Este mail se enviaría a ${recipientList.length} destinatarios:\n` +
          recipientList.slice(0, 30).map(r => `  · ${r.email} ${r.hasReservation ? '(reserva, saldo ' + r.balance + ')' : '(favorito)'}`).join('\n') +
          (recipientList.length > 30 ? `\n  ...y ${recipientList.length - 30} más` : '');
        const html = renderEmail({
          nombre: 'Admin',
          eventTitle: event.title,
          stageName, vigenteDesde, oldMin, newMin, currency,
          hasReservation: true, balanceDue: recipientList[0]?.balance ?? 100000,
          testFooter,
        });
        try {
          await enqueue(supabase, testEmail!, `[TEST] ⏰ Mañana sube el precio de ${event.title}`, html, `price-alert-test-${eventId}-${upcoming[0].id}-${Date.now()}`);
          sent = 1;
        } catch (e: any) { errors.push(String(e.message || e)); }
      } else {
        for (const r of recipientList) {
          const html = renderEmail({
            nombre: r.nombre, eventTitle: event.title, stageName, vigenteDesde, oldMin, newMin, currency,
            hasReservation: r.hasReservation, balanceDue: r.balance,
          });
          try {
            await enqueue(supabase, r.email, `⏰ Mañana sube el precio de ${event.title}`, html,
              `price-alert:${eventId}:${upcoming[0].id}:${normalize(r.email)}`);
            sent++;
          } catch (e: any) { errors.push(`${r.email}: ${e.message || e}`); }
        }
      }

      results.push({
        event_id: eventId,
        event_title: event.title,
        stage: stageName,
        vigente_desde: vigenteDesde.toISOString(),
        currency,
        old_min: oldMin,
        new_min: newMin,
        recipients_total: recipientList.length,
        recipients_reserva: recipientList.filter(r => r.hasReservation).length,
        recipients_favorito: recipientList.filter(r => !r.hasReservation).length,
        emails_sent: sent,
        errors,
      });
    }

    return json({ ok: true, mode, events_processed: results.length, results });
  } catch (e: any) {
    console.error('send-price-increase-alert', e);
    return json({ error: e.message || String(e) }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
