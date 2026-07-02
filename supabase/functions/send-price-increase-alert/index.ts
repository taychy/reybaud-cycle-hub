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
function fmtDateShort(d: Date): string {
  // "2/07 a las 00 hs"
  const s = new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const [date, time] = s.split('T');
  const [, m, dd] = date.split('-');
  return `${parseInt(dd, 10)}/${m} a las ${time.slice(0,2)} hs`;
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

interface PkgRow {
  name: string;
  currentPrice: number | null;
  newPrice: number | null;
  currency: string;
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
  packages?: PkgRow[];
  balanceDue?: number | null;   // with_balance
  shareUrl?: string;            // paid_full
  reserveUrl?: string;          // interested
  payUrl?: string;              // with_balance
  testFooter?: string;
}

const TEMPLATE_KEYS: Record<Variant, string> = {
  paid_full: 'price_alert_paid_full',
  with_balance: 'price_alert_with_balance',
  interested: 'price_alert_interested',
};

let TEMPLATE_CACHE: Record<string, { subject: string; html_body: string }> | null = null;
async function loadTemplates(supabase: any) {
  if (TEMPLATE_CACHE) return TEMPLATE_CACHE;
  const keys = Object.values(TEMPLATE_KEYS);
  const { data, error } = await supabase.from('email_templates').select('key, subject, html_body').in('key', keys);
  if (error) throw error;
  const map: Record<string, { subject: string; html_body: string }> = {};
  for (const t of data ?? []) map[t.key] = { subject: t.subject, html_body: t.html_body };
  TEMPLATE_CACHE = map;
  return map;
}

function subjectFor(v: Variant, eventTitle: string, tpls: Record<string, { subject: string }>): string {
  const raw = tpls[TEMPLATE_KEYS[v]]?.subject;
  if (raw) return raw.replace(/\{eventTitle\}/g, eventTitle);
  if (v === 'paid_full')    return `🎉 ¡Tu lugar en ${eventTitle} ya está asegurado a precio congelado!`;
  if (v === 'with_balance') return `⏰ Última llamada — el precio de ${eventTitle} sube en breve`;
  return `⏰ Última chance al precio actual de ${eventTitle}`;
}

function renderEmail(ctx: RenderCtx, tpls: Record<string, { subject: string; html_body: string }>): string {
  const { variant, nombre, eventTitle, vigenteDesde, oldMin, newMin, currency, packages, testFooter } = ctx;
  const diff = oldMin && oldMin > 0 ? Math.round(((newMin - oldMin) / oldMin) * 100) : null;
  const diffPct = diff && diff !== 0 ? `${diff > 0 ? '+' : ''}${diff}%` : null;
  const diffPctSuffix = diffPct ? ` un <b>${diffPct}</b>` : '';
  const fechaCorta = fmtDateShort(vigenteDesde);

  const TEXT = '#1a1a1a';
  const MUTED = '#555555';
  const LABEL = '#374151';
  const VALUE = '#111827';

  let priceRows = '';
  if (variant === 'paid_full') {
    priceRows = `
      ${oldMin ? `<tr><td style="color:${LABEL};padding:6px 0;">Precio base (más económico)</td><td style="text-align:right;padding:6px 0;color:${VALUE};">${escapeHtml(fmtMoney(oldMin, currency))}</td></tr>` : ''}
      <tr><td style="color:${LABEL};padding:6px 0;">Tu precio (congelado)</td><td style="text-align:right;padding:6px 0;color:#166534;font-weight:700;">${escapeHtml(fmtMoney(oldMin ?? newMin, currency))} ✅</td></tr>
      <tr><td style="color:${LABEL};padding:6px 0;">Precio base desde el ${fechaCorta}</td><td style="text-align:right;padding:6px 0;color:${BRAND};font-weight:700;">${escapeHtml(fmtMoney(newMin, currency))}</td></tr>`;
  } else {
    priceRows = `
      <tr><td style="color:${LABEL};padding:6px 0;">Precio base hoy</td><td style="text-align:right;padding:6px 0;color:${VALUE};">${escapeHtml(fmtMoney(oldMin ?? newMin, currency))}</td></tr>
      <tr><td style="color:${LABEL};padding:6px 0;">Precio base desde el ${fechaCorta}</td><td style="text-align:right;padding:6px 0;color:${BRAND};font-weight:700;">${escapeHtml(fmtMoney(newMin, currency))}</td></tr>`;
  }

  let packagesBlock = '';
  if (packages && packages.length > 0) {
    const rows = packages.map((p) => {
      const cur = p.currentPrice != null ? escapeHtml(fmtMoney(p.currentPrice, p.currency)) : '—';
      const nw = p.newPrice != null ? escapeHtml(fmtMoney(p.newPrice, p.currency)) : '—';
      const nwColor = p.newPrice != null && p.currentPrice != null && p.newPrice > p.currentPrice ? BRAND : VALUE;
      const nwWeight = p.newPrice != null && p.currentPrice != null && p.newPrice > p.currentPrice ? '700' : '500';
      return `<tr>
        <td style="padding:8px 8px 8px 0;color:${TEXT};font-size:13px;border-top:1px solid #f0f0f0;">${escapeHtml(p.name)}</td>
        <td style="padding:8px 4px;text-align:right;color:${VALUE};font-size:13px;border-top:1px solid #f0f0f0;">${cur}</td>
        <td style="padding:8px 0 8px 4px;text-align:right;color:${nwColor};font-weight:${nwWeight};font-size:13px;border-top:1px solid #f0f0f0;">${nw}</td>
      </tr>`;
    }).join('');
    packagesBlock = `<div style="margin:18px 0;">
      <div style="font-size:13px;color:${LABEL};font-weight:600;margin-bottom:8px;">Aumento por paquete ⬇</div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 16px;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 8px 6px 0;color:${MUTED};font-weight:600;font-size:12px;">Paquete</th>
              <th style="text-align:right;padding:6px 4px;color:${MUTED};font-weight:600;font-size:12px;">Actual</th>
              <th style="text-align:right;padding:6px 0 6px 4px;color:${MUTED};font-weight:600;font-size:12px;">Desde ${fechaCorta}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  const ctaHref = variant === 'paid_full' ? (ctx.shareUrl || `${APP_URL}/eventos`)
    : variant === 'with_balance' ? (ctx.payUrl || `${APP_URL}/mis-reservas`)
    : (ctx.reserveUrl || `${APP_URL}/eventos`);

  const vars: Record<string, string> = {
    nombre: escapeHtml(nombre),
    eventTitle: escapeHtml(eventTitle),
    fechaCorta,
    diffPctSuffix,
    priceRows,
    packagesBlock,
    ctaHref,
    brandColor: BRAND,
  };

  const key = TEMPLATE_KEYS[variant];
  const bodyTpl = tpls[key]?.html_body || '';
  const body = bodyTpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

  const testBlock = testFooter
    ? `<hr style="border:0;border-top:1px dashed #ccc;margin:22px 0 10px;"/><pre style="background:#f5f5f5;padding:10px;border-radius:6px;font-size:11px;color:#333;white-space:pre-wrap;">${escapeHtml(testFooter)}</pre>`
    : '';

  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${TEXT};">
  <div style="max-width:560px;margin:0 auto;padding:28px 22px;">
    <div style="border-top:4px solid ${BRAND};padding-top:22px;">
      ${body}
      <p style="font-size:12px;color:${MUTED};line-height:1.5;margin:22px 0 0;">
        Ante cualquier duda respondé este mail o escribinos por WhatsApp.
      </p>
      ${testBlock}
    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const mode: 'test' | 'send' | 'preview' = body.mode === 'send' ? 'send' : body.mode === 'preview' ? 'preview' : 'test';
    const requestedEventId: string | null = body.event_id || null;
    const testEmail: string | null = body.test_email || null;
    const testVariants: Variant[] = Array.isArray(body.test_variants) && body.test_variants.length
      ? body.test_variants
      : ['paid_full', 'with_balance', 'interested'];
    const sendVariants: Set<Variant> = new Set(
      Array.isArray(body.send_variants) && body.send_variants.length
        ? body.send_variants
        : ['paid_full', 'with_balance', 'interested']
    );
    // Whitelist de emails aprobados. Si viene en mode='send', solo se envía a esos.
    const approvedEmails: Set<string> | null = Array.isArray(body.approved_emails) && body.approved_emails.length
      ? new Set(body.approved_emails.map((e: string) => normalize(e)))
      : null;
    if (mode === 'test' && !testEmail) return json({ error: 'test_email requerido cuando mode=test' }, 400);

    const now = new Date();
    const in24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const overrideVigenteDesde: string | null = body.override_vigente_desde || null;

    // FIX: siempre filtramos por etapas FUTURAS (vigente_desde > now).
    // Antes, con event_id el filtro se salteaba y agarrábamos la etapa histórica
    // "Precio actual" (vigente_desde año 2000) → mails con fecha 31/12/1999.
    let stagesQuery = supabase
      .from('event_package_price_stages')
      .select('id, package_id, nombre, precio, currency, vigente_desde, sort_order, activo, event_packages!inner(id, event_id, nombre, events!inner(id, title, status))')
      .eq('activo', true)
      .gt('vigente_desde', now.toISOString())
      .order('vigente_desde', { ascending: true });
    if (!requestedEventId) {
      stagesQuery = stagesQuery.lte('vigente_desde', in24.toISOString());
    }
    const { data: stages, error: sErr } = await stagesQuery;
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
      const vigenteDesde = overrideVigenteDesde ? new Date(overrideVigenteDesde) : new Date(upcoming.map((u: any) => u.vigente_desde).sort()[0]);
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

      // Detalle por paquete: precio actual (última etapa <= now) vs precio nuevo (primera etapa > now)
      const { data: pkgs } = await supabase
        .from('event_packages')
        .select('id, nombre, sort_order, activo, event_package_price_stages(precio, currency, vigente_desde, activo)')
        .eq('event_id', eventId)
        .eq('activo', true)
        .order('sort_order', { ascending: true });
      const packagesList: PkgRow[] = (pkgs ?? []).map((p: any) => {
        const stages = (p.event_package_price_stages ?? []).filter((s: any) => s.activo);
        const past = stages.filter((s: any) => new Date(s.vigente_desde) <= now)
          .sort((a: any, b: any) => new Date(b.vigente_desde).getTime() - new Date(a.vigente_desde).getTime());
        const future = stages.filter((s: any) => new Date(s.vigente_desde) > now)
          .sort((a: any, b: any) => new Date(a.vigente_desde).getTime() - new Date(b.vigente_desde).getTime());
        const cur = past[0] ? Number(past[0].precio) : null;
        const nw = future[0] ? Number(future[0].precio) : cur;
        const cur0 = past[0]?.currency || future[0]?.currency || currency;
        return { name: p.nombre || 'Paquete', currentPrice: cur, newPrice: nw, currency: cur0 };
      }).filter((p) => p.currentPrice != null || p.newPrice != null);

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
          oldMin, newMin, currency, packages: packagesList,
          balanceDue: r.balance ?? null,
          shareUrl: eventUrl, reserveUrl: eventUrl, payUrl: `${APP_URL}/mis-reservas`,
        };
        const html = renderEmail(ctx);
        await enqueue(supabase, r.email, subjectFor(variant, event.title), html,
          `price-alert:${variant}:${eventId}:${upcoming[0].id}:${r.email}`, `price_alert_${variant}`);
      };

      if (mode === 'preview') {
        // Devolvemos todos los destinatarios con el HTML renderizado, sin encolar nada.
        const buildPreview = (variant: Variant, r: Rec) => {
          const ctx: RenderCtx = {
            variant, nombre: r.nombre, eventTitle: event.title, stageName, vigenteDesde,
            oldMin, newMin, currency, packages: packagesList,
            balanceDue: r.balance ?? null,
            shareUrl: eventUrl, reserveUrl: eventUrl, payUrl: `${APP_URL}/mis-reservas`,
          };
          return {
            variant,
            email: r.email,
            nombre: r.nombre,
            subject: subjectFor(variant, event.title),
            html: renderEmail(ctx),
            balance: r.balance ?? null,
          };
        };
        summary.previews = [
          ...Array.from(paidFull.values()).map((r) => buildPreview('paid_full', r)),
          ...Array.from(withBalance.values()).map((r) => buildPreview('with_balance', r)),
          ...Array.from(interested.values()).map((r) => buildPreview('interested', r)),
        ];
      } else if (mode === 'test') {
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
            oldMin, newMin, currency, packages: packagesList, balanceDue: sampleBalance,
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
        const passesApproval = (email: string) => !approvedEmails || approvedEmails.has(email);
        if (sendVariants.has('paid_full'))    for (const r of paidFull.values())    { if (!passesApproval(r.email)) continue; try { await sendOne('paid_full', r); summary.emails_sent++; } catch (e: any) { summary.errors.push(`paid_full ${r.email}: ${e.message||e}`); } }
        if (sendVariants.has('with_balance')) for (const r of withBalance.values()) { if (!passesApproval(r.email)) continue; try { await sendOne('with_balance', r); summary.emails_sent++; } catch (e: any) { summary.errors.push(`with_balance ${r.email}: ${e.message||e}`); } }
        if (sendVariants.has('interested'))   for (const r of interested.values())  { if (!passesApproval(r.email)) continue; try { await sendOne('interested', r); summary.emails_sent++; } catch (e: any) { summary.errors.push(`interested ${r.email}: ${e.message||e}`); } }
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
