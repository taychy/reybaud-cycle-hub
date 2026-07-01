// deno-lint-ignore-file no-explicit-any
/**
 * Aviso "sube el precio" segmentado por tipo de cliente.
 *
 * 3 audiencias / 3 templates:
 *   A) paid_full    → reservó y pagó 100%. Mensaje: "tu precio está congelado, compartí para que tus amigos entren al precio actual".
 *   B) with_balance → reservó con saldo pendiente. Mensaje: "pagá el saldo antes del aumento para congelar el precio actual".
 *   C) interested   → favorito o interesado sin reserva. Mensaje: "reservá ahora para congelar el precio actual".
 *
 * Body:
 *   { mode: 'test' | 'send',
 *     event_id?: uuid,
 *     test_email?: string,        // requerido cuando mode='test'
 *     test_variants?: ('paid_full'|'with_balance'|'interested')[]  // default: los 3
 *   }
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

type Variant = 'paid_full' | 'with_balance' | 'interested';

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

async function enqueue(supabase: any, to: string, subject: string, html: string, idempotencyKey: string, label: string) {
  const unsub = await getOrCreateUnsubscribeToken(supabase, to);
  const payload = {
    message_id: crypto.randomUUID(),
    to,
    from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
    sender_domain: SENDER_DOMAIN,
    subject, html,
    text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000),
    purpose: 'transactional',
    label,
    idempotency_key: idempotencyKey,
    queued_at: new Date().toISOString(),
    unsubscribe_token: unsub,
  };
  const { error } = await supabase.rpc('enqueue_email', { queue_name: 'transactional_emails', payload });
  if (error) throw error;
}

interface RenderCtx {
  variant: Variant;
  nombre: string;
  eventTitle: string;
  stageName: string;
  vigenteDesde: Date;
  oldMin: number | null;
  newMin: number;
  currency: string;
  balanceDue?: number | null;   // with_balance
  shareUrl?: string;            // paid_full
  reserveUrl?: string;          // interested
  payUrl?: string;              // with_balance
  testFooter?: string;
}

function subjectFor(v: Variant, eventTitle: string): string {
  if (v === 'paid_full')    return `📣 Tu lugar en ${eventTitle} está confirmado — compartilo antes del aumento`;
  if (v === 'with_balance') return `⏰ Pagá tu saldo y congelá el precio de ${eventTitle}`;
  return `⏰ Última chance al precio actual de ${eventTitle}`;
}

function renderEmail(ctx: RenderCtx): string {
  const { variant, nombre, eventTitle, stageName, vigenteDesde, oldMin, newMin, currency, testFooter } = ctx;
  const diff = oldMin && oldMin > 0 ? Math.round(((newMin - oldMin) / oldMin) * 100) : null;

  let intro = '';
  let extraBlock = '';
  let ctaHref = `${APP_URL}/eventos`;
  let ctaLabel = 'Ver el evento';
  let tag = '⏰ AVISO IMPORTANTE';

  if (variant === 'paid_full') {
    tag = '🎉 TU LUGAR ESTÁ CONFIRMADO';
    intro = `Hola ${escapeHtml(nombre)}, ya pagaste el total de <b>${escapeHtml(eventTitle)}</b>, así que <b>tu precio está congelado</b>. Este mail es para que lo sepas y, si querés, invites a tus amigos: el <b>${fmtDateAR(vigenteDesde)}</b> arranca la etapa <b>${escapeHtml(stageName)}</b>${diff && diff !== 0 ? ` (${diff > 0 ? '+' : ''}${diff}% aprox.)` : ''} y ya no van a poder entrar al precio actual.`;
    extraBlock = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;margin:16px 0;">
      <div style="font-size:12px;color:#166534;">Compartí con alguien que quiera sumarse</div>
      <div style="font-size:14px;color:#14532d;margin-top:6px;line-height:1.5;">
        Si conocés a alguien que le interesa el viaje, este es el momento: reservando ahora, congela el precio de <b>${escapeHtml(fmtMoney(newMin, currency))}</b> que arranca ${fmtDateAR(vigenteDesde)}.
      </div>
    </div>`;
    ctaHref = ctx.shareUrl || `${APP_URL}/eventos`;
    ctaLabel = 'Compartir el evento';
  }

  if (variant === 'with_balance') {
    tag = '⏰ AVISO — SUBE EL PRECIO';
    intro = `Hola ${escapeHtml(nombre)}, tenés reservado <b>${escapeHtml(eventTitle)}</b> pero todavía queda saldo pendiente. El <b>${fmtDateAR(vigenteDesde)}</b> entra en vigencia la etapa <b>${escapeHtml(stageName)}</b>${diff && diff !== 0 ? ` (${diff > 0 ? '+' : ''}${diff}% aprox.)` : ''}. <b>Si pagás tu saldo antes de esa fecha, congelás el precio actual</b>. Si no, el saldo se recalcula con el precio nuevo.`;
    const bal = ctx.balanceDue ?? 0;
    extraBlock = `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;margin:16px 0;">
      <div style="font-size:12px;color:#9a3412;">Tu saldo pendiente</div>
      <div style="font-size:22px;font-weight:700;color:${BRAND};">${escapeHtml(fmtMoney(bal, currency))}</div>
      <div style="font-size:12px;color:#7c2d12;margin-top:4px;">Pagalo antes del ${fmtDateAR(vigenteDesde)} para no pagar el aumento.</div>
    </div>`;
    ctaHref = ctx.payUrl || `${APP_URL}/mis-reservas`;
    ctaLabel = 'Ir a mi reserva y pagar';
  }

  if (variant === 'interested') {
    tag = '⏰ ÚLTIMA CHANCE AL PRECIO ACTUAL';
    intro = `Hola ${escapeHtml(nombre)}, sabemos que te interesa <b>${escapeHtml(eventTitle)}</b>. El <b>${fmtDateAR(vigenteDesde)}</b> arranca la etapa <b>${escapeHtml(stageName)}</b>${diff && diff !== 0 ? ` (${diff > 0 ? '+' : ''}${diff}% aprox.)` : ''}. <b>Reservando ahora congelás el precio actual</b>.`;
    extraBlock = `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;margin:16px 0;">
      <div style="font-size:12px;color:#9a3412;">Cómo congelás el precio</div>
      <div style="font-size:14px;color:#7c2d12;margin-top:6px;line-height:1.5;">
        Con la <b>seña de reserva</b> te asegurás el precio actual (${escapeHtml(fmtMoney(oldMin ?? newMin, currency))}). Después de ${fmtDateAR(vigenteDesde)} vas a pagar ${escapeHtml(fmtMoney(newMin, currency))}.
      </div>
    </div>`;
    ctaHref = ctx.reserveUrl || `${APP_URL}/eventos`;
    ctaLabel = 'Reservar antes del aumento';
  }

  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;padding:28px 22px;">
    <div style="border-top:4px solid ${BRAND};padding-top:22px;">
      <p style="margin:0 0 4px;color:${BRAND};font-weight:700;font-size:13px;letter-spacing:0.4px;">${tag}</p>
      <h1 style="font-size:22px;margin:0 0 10px;">${variant === 'paid_full' ? 'Compartí' : 'Sube el precio de'} <span style="color:${BRAND}">${escapeHtml(eventTitle)}</span></h1>
      <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.55;">${intro}</p>

      <div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:16px;margin:12px 0;">
        <table style="width:100%;font-size:14px;">
          ${oldMin ? `<tr><td style="color:#777;padding:4px 0;">Precio actual (desde)</td><td style="text-align:right;padding:4px 0;">${escapeHtml(fmtMoney(oldMin, currency))}</td></tr>` : ''}
          <tr><td style="color:#777;padding:4px 0;">Precio nuevo (desde)</td><td style="text-align:right;padding:4px 0;font-weight:700;color:${BRAND};">${escapeHtml(fmtMoney(newMin, currency))}</td></tr>
          <tr><td style="color:#777;padding:4px 0;">Vigente desde</td><td style="text-align:right;padding:4px 0;">${fmtDateAR(vigenteDesde)}</td></tr>
        </table>
      </div>

      ${extraBlock}

      <div style="text-align:center;margin:26px 0;">
        <a href="${ctaHref}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:14px 26px;border-radius:10px;font-weight:600;font-size:14px;">${ctaLabel}</a>
      </div>

      <p style="font-size:12px;color:#888;line-height:1.5;margin:22px 0 0;">
        Ante cualquier duda respondé este mail o escribinos por WhatsApp.
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
    const testVariants: Variant[] = Array.isArray(body.test_variants) && body.test_variants.length
      ? body.test_variants
      : ['paid_full', 'with_balance', 'interested'];
    if (mode === 'test' && !testEmail) return json({ error: 'test_email requerido cuando mode=test' }, 400);

    const now = new Date();
    const in24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: stages, error: sErr } = await supabase
      .from('event_package_price_stages')
      .select('id, package_id, nombre, precio, currency, vigente_desde, sort_order, activo, event_packages!inner(id, event_id, nombre, events!inner(id, title, status))')
      .eq('activo', true)
      .gt('vigente_desde', now.toISOString())
      .lte('vigente_desde', in24.toISOString())
      .order('vigente_desde', { ascending: true });
    if (sErr) throw sErr;

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
      const currency = upcoming[0].currency || 'ARS';
      const newMin = Math.min(...upcoming.map((u: any) => Number(u.precio)));
      const vigenteDesde = new Date(upcoming.map((u: any) => u.vigente_desde).sort()[0]);
      const stageName = upcoming[0].nombre || 'Nueva etapa';

      const { data: currentStages } = await supabase
        .from('event_package_price_stages')
        .select('precio, vigente_desde, event_packages!inner(event_id)')
        .eq('activo', true)
        .lte('vigente_desde', now.toISOString())
        .eq('event_packages.event_id', eventId);
      const oldMin = currentStages && currentStages.length
        ? Math.min(...currentStages.map((c: any) => Number(c.precio)))
        : null;

      const eventUrl = `${APP_URL}/eventos/${eventId}`;

      // Recipientes por variante
      type Rec = { email: string; nombre: string; balance?: number | null };
      const paidFull: Map<string, Rec> = new Map();
      const withBalance: Map<string, Rec> = new Map();
      const interested: Map<string, Rec> = new Map();

      const { data: reservas } = await supabase
        .from('event_reservations')
        .select('id, alumno_id, external_email, external_first_name, amount_paid, amount_total, balance_due, reservation_status, cancelled_at, alumnos(email, nombre)')
        .eq('event_id', eventId)
        .is('cancelled_at', null)
        .not('reservation_status', 'in', '(cancelada,rechazada)');
      for (const r of reservas ?? []) {
        const paid = Number(r.amount_paid ?? 0);
        const total = Number(r.amount_total ?? 0);
        const balance = r.balance_due != null ? Number(r.balance_due) : Math.max(0, total - paid);
        const email = (r as any).alumnos?.email || r.external_email;
        const nombre = (r as any).alumnos?.nombre || r.external_first_name || 'Hola';
        if (!email) continue;
        const key = normalize(email);
        // NUEVA SEGMENTACIÓN:
        // paid_full  = reservó y ya hizo al menos un pago (cualquier monto > 0) → precio congelado
        // with_balance = reservó pero NO pagó ni siquiera la seña → debe pagar seña para congelar
        if (paid > 0) {
          paidFull.set(key, { email: key, nombre, balance });
        } else {
          withBalance.set(key, { email: key, nombre, balance: total > 0 ? total : null });
        }
      }

      const { data: favs } = await supabase
        .from('event_favorites')
        .select('alumno_id, alumnos(email, nombre)')
        .eq('event_id', eventId);
      for (const f of favs ?? []) {
        const email = (f as any).alumnos?.email;
        const nombre = (f as any).alumnos?.nombre || 'Hola';
        if (!email) continue;
        const key = normalize(email);
        if (paidFull.has(key) || withBalance.has(key)) continue; // ya son reservantes
        interested.set(key, { email: key, nombre });
      }

      const summary: any = {
        event_id: eventId, event_title: event.title, stage: stageName,
        vigente_desde: vigenteDesde.toISOString(), currency, old_min: oldMin, new_min: newMin,
        buckets: { paid_full: paidFull.size, with_balance: withBalance.size, interested: interested.size },
        emails_sent: 0, errors: [] as string[],
      };

      const sendOne = async (variant: Variant, r: Rec) => {
        const ctx: RenderCtx = {
          variant, nombre: r.nombre, eventTitle: event.title, stageName, vigenteDesde,
          oldMin, newMin, currency,
          balanceDue: r.balance ?? null,
          shareUrl: eventUrl, reserveUrl: eventUrl, payUrl: `${APP_URL}/mis-reservas`,
        };
        const html = renderEmail(ctx);
        await enqueue(supabase, r.email, subjectFor(variant, event.title), html,
          `price-alert:${variant}:${eventId}:${upcoming[0].id}:${r.email}`, `price_alert_${variant}`);
      };

      if (mode === 'test') {
        for (const variant of testVariants) {
          const sampleFromBucket = variant === 'paid_full' ? Array.from(paidFull.values())[0]
            : variant === 'with_balance' ? Array.from(withBalance.values())[0]
            : Array.from(interested.values())[0];
          const sampleName = sampleFromBucket?.nombre || 'Admin';
          const sampleBalance = variant === 'with_balance' ? (sampleFromBucket?.balance ?? 150000) : null;
          const bucketCount = variant === 'paid_full' ? paidFull.size
            : variant === 'with_balance' ? withBalance.size : interested.size;
          const testFooter = `[TEST — variante ${variant}]\nEste mail iría a ${bucketCount} destinatario(s) reales del bucket "${variant}".\nEvento: ${event.title}`;
          const html = renderEmail({
            variant, nombre: sampleName, eventTitle: event.title, stageName, vigenteDesde,
            oldMin, newMin, currency, balanceDue: sampleBalance,
            shareUrl: eventUrl, reserveUrl: eventUrl, payUrl: `${APP_URL}/mis-reservas`,
            testFooter,
          });
          try {
            await enqueue(supabase, testEmail!, `[TEST ${variant}] ${subjectFor(variant, event.title)}`, html,
              `price-alert-test:${variant}:${eventId}:${upcoming[0].id}:${Date.now()}`, `price_alert_${variant}_test`);
            summary.emails_sent++;
          } catch (e: any) { summary.errors.push(`${variant}: ${e.message || e}`); }
        }
      } else {
        for (const r of paidFull.values())     { try { await sendOne('paid_full', r); summary.emails_sent++; } catch (e: any) { summary.errors.push(`paid_full ${r.email}: ${e.message||e}`); } }
        for (const r of withBalance.values())  { try { await sendOne('with_balance', r); summary.emails_sent++; } catch (e: any) { summary.errors.push(`with_balance ${r.email}: ${e.message||e}`); } }
        for (const r of interested.values())   { try { await sendOne('interested', r); summary.emails_sent++; } catch (e: any) { summary.errors.push(`interested ${r.email}: ${e.message||e}`); } }
      }

      results.push(summary);
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
