/**
 * Cron diario 08:00 ART. Procesa cuotas pendientes y envía recordatorios
 * a alumnos (vía notify-reservation que encola email + log) y digest agregado
 * a admins por evento.
 *
 * Idempotencia: una fila por (installment_id, offset, channel, recipient) en
 * reservation_installment_reminders con UNIQUE en idempotency_key.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SENDER_DOMAIN = 'notify.reybaud-app.com';
const FROM_NAME = 'Reybaud Ciclismo';

const DEFAULT_REMINDERS_SENA = [0, 1, 3];
const DEFAULT_REMINDERS_CUOTA = [-7, -2, 0, 3, 7];
const DEFAULT_REMINDERS_ULTIMA = [-14, -7, -2, 0, 3, 7];

function fmtMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function fmtDateAR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO(): string {
  const d = new Date();
  // ART = UTC-3
  const art = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return art.toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  const [y1, m1, d1] = fromISO.split('-').map(Number);
  const [y2, m2, d2] = toISO.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

interface Reservation {
  id: string;
  alumno_id: string | null;
  event_id: string;
  payment_plan_snapshot: any;
}
interface AlumnoLite { id: string; nombre: string; apellido: string | null; email: string; }
interface EventLite { id: string; title: string; admin_alert_emails: string[] | null; }
interface InstRow {
  id: string;
  reservation_id: string;
  installment_number: number;
  label: string;
  amount: number;
  currency: string;
  due_date: string | null;
  due_date_original: string | null;
  status: string;
  installment_type: 'sena' | 'cuota';
  balance_due: number;
  paid_amount: number;
  saldo_pendiente: number | null;
}

function getOffsets(inst: InstRow, snapshot: any): number[] {
  // Buscar offsets en snapshot.template.installments
  if (inst.installment_type === 'sena') return DEFAULT_REMINDERS_SENA;
  try {
    const tpl = snapshot?.template;
    const tplInsts: any[] = Array.isArray(tpl?.installments) ? tpl.installments : [];
    const found = tplInsts.find((t) => t.numero === inst.installment_number);
    if (found?.reminders_config?.length > 0) return found.reminders_config;
    const isLast = inst.installment_number === tplInsts.length;
    return isLast ? DEFAULT_REMINDERS_ULTIMA : DEFAULT_REMINDERS_CUOTA;
  } catch {
    return DEFAULT_REMINDERS_CUOTA;
  }
}

function buildEmailHTML(kind: 'upcoming' | 'today' | 'overdue', vars: Record<string, string>): string {
  const titles = {
    upcoming: `Recordatorio: vence el ${vars.fecha}`,
    today: `Hoy vence tu pago`,
    overdue: `Pago pendiente de ${vars.descripcion}`,
  };
  const messages = {
    upcoming: `Te queremos recordar que el <strong>${vars.fecha}</strong> vence <strong>${vars.descripcion}</strong> del evento <strong>${vars.evento}</strong> por un monto de <strong>${vars.monto}</strong>.`,
    today: `Hoy vence <strong>${vars.descripcion}</strong> del evento <strong>${vars.evento}</strong> por un monto de <strong>${vars.monto}</strong>. ¡Avisanos cuando lo realices!`,
    overdue: `<strong>${vars.descripcion}</strong> del evento <strong>${vars.evento}</strong> venció el <strong>${vars.fecha}</strong>. Saldo pendiente: <strong>${vars.monto}</strong>. Si ya pagaste, ignorá este mensaje; si necesitás ayuda escribinos.`,
  };
  return `
<!doctype html><html><body style="font-family: Arial, sans-serif; background:#ffffff; color:#1a1a1a; padding:20px;">
  <div style="max-width:560px; margin:0 auto;">
    <h2 style="color:#e07b00; font-family:'Oswald', Arial, sans-serif;">${titles[kind]}</h2>
    <p>Hola ${vars.nombre},</p>
    <p>${messages[kind]}</p>
    <p style="margin-top:24px; color:#666; font-size:13px;">Si tenés dudas, contestá este mail o escribinos por WhatsApp.</p>
    <p style="color:#666; font-size:12px;">Reybaud Ciclismo</p>
  </div>
</body></html>`;
}

function buildAdminDigestHTML(evento: string, items: Array<{ alumno: string; cuota: string; fecha: string; dias: number; monto: string }>): string {
  const rows = items.map((it) => `
    <tr>
      <td style="padding:6px 10px; border-bottom:1px solid #eee;">${it.alumno}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #eee;">${it.cuota}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #eee;">${it.fecha}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #eee; color:${it.dias > 0 ? '#c0392b' : '#000'};">${it.dias > 0 ? `+${it.dias}d` : 'hoy'}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #eee; text-align:right;">${it.monto}</td>
    </tr>`).join('');
  return `
<!doctype html><html><body style="font-family: Arial, sans-serif; background:#ffffff; color:#1a1a1a; padding:20px;">
  <div style="max-width:720px; margin:0 auto;">
    <h2 style="color:#e07b00;">Cobranzas — ${evento}</h2>
    <p>Cuotas a revisar (${items.length}):</p>
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead><tr style="background:#f5f5f5;">
        <th style="text-align:left; padding:8px 10px;">Alumno</th>
        <th style="text-align:left; padding:8px 10px;">Cuota</th>
        <th style="text-align:left; padding:8px 10px;">Vencimiento</th>
        <th style="text-align:left; padding:8px 10px;">Estado</th>
        <th style="text-align:right; padding:8px 10px;">Monto</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</body></html>`;
}

async function getDefaultAlertEmails(supabase: any): Promise<string[]> {
  const { data } = await supabase.from('app_config').select('value').eq('key', 'default_payment_alert_emails').maybeSingle();
  const v = data?.value;
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && Array.isArray((v as any).emails)) return (v as any).emails;
  return [];
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();
async function getOrCreateUnsubscribeToken(supabase: any, email: string): Promise<string> {
  const e = normalizeEmail(email);
  const { data: ex } = await supabase.from('email_unsubscribe_tokens').select('token').eq('email', e).maybeSingle();
  if (ex?.token) return ex.token;
  const t = crypto.randomUUID();
  const { data: ins, error } = await supabase.from('email_unsubscribe_tokens').insert({ email: e, token: t }).select('token').single();
  if (!error && ins?.token) return ins.token;
  const { data: fb } = await supabase.from('email_unsubscribe_tokens').select('token').eq('email', e).maybeSingle();
  if (fb?.token) return fb.token;
  throw error ?? new Error('Could not create unsubscribe token');
}

async function enqueueEmail(supabase: any, to: string, subject: string, html: string, idempotencyKey: string, label: string) {
  const messageId = crypto.randomUUID();
  const unsubToken = await getOrCreateUnsubscribeToken(supabase, to);
  const payload = {
    message_id: messageId,
    to,
    from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
    sender_domain: SENDER_DOMAIN,
    subject,
    html,
    text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    purpose: 'transactional',
    label,
    idempotency_key: idempotencyKey,
    queued_at: new Date().toISOString(),
    unsubscribe_token: unsubToken,
  };
  const { error } = await supabase.rpc('enqueue_email', { queue_name: 'transactional_emails', payload });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const hoy = todayISO();

  const summary = {
    processed: 0,
    student_reminders_sent: 0,
    admin_digests_sent: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // 1. Cargar cuotas pendientes/parciales con fecha
    const { data: insts, error: instsErr } = await supabase
      .from('reservation_installments')
      .select('id, reservation_id, installment_number, label, amount, currency, due_date, due_date_original, status, installment_type, balance_due, paid_amount, saldo_pendiente')
      .in('status', ['pendiente', 'parcial']);
    if (instsErr) throw instsErr;
    if (!insts || insts.length === 0) {
      return new Response(JSON.stringify({ ok: true, summary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reservationIds = Array.from(new Set(insts.map((i: any) => i.reservation_id)));
    const { data: reservations } = await supabase
      .from('event_reservations')
      .select('id, alumno_id, event_id, payment_plan_snapshot')
      .in('id', reservationIds);
    const resMap = new Map<string, Reservation>((reservations || []).map((r: any) => [r.id, r]));

    const eventIds = Array.from(new Set((reservations || []).map((r: any) => r.event_id)));
    const { data: events } = await supabase
      .from('events')
      .select('id, title, admin_alert_emails')
      .in('id', eventIds);
    const eventMap = new Map<string, EventLite>((events || []).map((e: any) => [e.id, e]));

    const alumnoIds = Array.from(new Set((reservations || []).map((r: any) => r.alumno_id).filter(Boolean)));
    const { data: alumnos } = await supabase
      .from('alumnos')
      .select('id, nombre, apellido, email')
      .in('id', alumnoIds);
    const alumnoMap = new Map<string, AlumnoLite>((alumnos || []).map((a: any) => [a.id, a]));

    const defaultAlertEmails = await getDefaultAlertEmails(supabase);

    // Agrupador para digest admin: por evento, items vencidos (+3, +7)
    const adminDigest = new Map<string, Array<{ alumno: string; cuota: string; fecha: string; dias: number; monto: string }>>();

    for (const rawInst of insts as InstRow[]) {
      summary.processed++;
      const reservation = resMap.get(rawInst.reservation_id);
      if (!reservation || !rawInst.due_date) { summary.skipped++; continue; }
      const event = eventMap.get(reservation.event_id);
      const alumno = reservation.alumno_id ? alumnoMap.get(reservation.alumno_id) : null;
      if (!event) { summary.skipped++; continue; }

      const offsets = getOffsets(rawInst, reservation.payment_plan_snapshot);
      const diff = daysBetween(rawInst.due_date, hoy); // hoy - due_date; >0 = vencida, <0 = falta
      // Encontrar offset que corresponde a hoy
      // offsets están en términos de "días respecto a fecha de vencimiento":
      //   -7 = 7 días antes => diff == -7
      //    0 = día D       => diff == 0
      //   +3 = 3 días después => diff == 3
      const matchedOffset = offsets.find((o) => o === diff);
      if (matchedOffset === undefined) { summary.skipped++; continue; }

      const monto = Number(rawInst.saldo_pendiente ?? rawInst.balance_due ?? rawInst.amount);
      const kind: 'upcoming' | 'today' | 'overdue' =
        matchedOffset < 0 ? 'upcoming' : matchedOffset === 0 ? 'today' : 'overdue';

      // === Recordatorio al alumno ===
      if (alumno?.email) {
        const idem = `inst-${rawInst.id}-off${matchedOffset}-email-alumno`;
        const { data: existing } = await supabase
          .from('reservation_installment_reminders')
          .select('id, status')
          .eq('idempotency_key', idem)
          .maybeSingle();
        if (!existing) {
          const descripcion = rawInst.installment_type === 'sena' ? 'la seña' : rawInst.label;
          const html = buildEmailHTML(kind, {
            nombre: alumno.nombre,
            descripcion,
            evento: event.title,
            fecha: fmtDateAR(rawInst.due_date),
            monto: fmtMoney(monto, rawInst.currency),
          });
          const subject = kind === 'upcoming' ? `Recordatorio: ${descripcion} vence el ${fmtDateAR(rawInst.due_date)}`
            : kind === 'today' ? `Hoy vence ${descripcion}`
            : `Pago pendiente: ${descripcion}`;
          try {
            await enqueueEmail(supabase, alumno.email, subject, html, idem, `installment_${kind}`);
            await supabase.from('reservation_installment_reminders').insert({
              reservation_installment_id: rawInst.id,
              offset_days: matchedOffset,
              channel: 'email',
              recipient_type: 'alumno',
              recipient_email: alumno.email,
              status: 'sent',
              sent_at: new Date().toISOString(),
              idempotency_key: idem,
            });
            summary.student_reminders_sent++;
          } catch (err) {
            await supabase.from('reservation_installment_reminders').insert({
              reservation_installment_id: rawInst.id,
              offset_days: matchedOffset,
              channel: 'email',
              recipient_type: 'alumno',
              recipient_email: alumno.email,
              status: 'failed',
              error_message: String((err as any)?.message || err),
              idempotency_key: idem,
            });
            summary.errors++;
          }
        }
      }

      // === Acumular digest admin: día D (individual) y vencidas (digest) ===
      if (matchedOffset >= 0) {
        const list = adminDigest.get(event.id) ?? [];
        list.push({
          alumno: alumno ? `${alumno.nombre} ${alumno.apellido || ''}`.trim() : '—',
          cuota: rawInst.installment_type === 'sena' ? 'Seña' : rawInst.label,
          fecha: fmtDateAR(rawInst.due_date),
          dias: matchedOffset,
          monto: fmtMoney(monto, rawInst.currency),
        });
        adminDigest.set(event.id, list);
      }
    }

    // 2. Enviar digest admin por evento
    for (const [eventId, items] of adminDigest.entries()) {
      const event = eventMap.get(eventId);
      if (!event) continue;
      const emails = (event.admin_alert_emails && event.admin_alert_emails.length > 0)
        ? event.admin_alert_emails
        : defaultAlertEmails;
      if (emails.length === 0) continue;

      const idemDigest = `digest-${eventId}-${hoy}`;
      const { data: existingDig } = await supabase
        .from('reservation_installment_reminders')
        .select('id')
        .eq('idempotency_key', idemDigest)
        .maybeSingle();
      if (existingDig) continue;

      const html = buildAdminDigestHTML(event.title, items);
      const subject = `Cobranzas ${event.title} — ${items.length} cuota${items.length === 1 ? '' : 's'} a revisar`;
      let allOk = true;
      for (const email of emails) {
        try {
          await enqueueEmail(supabase, email, subject, html, `${idemDigest}-${email}`, 'installment_admin_digest');
        } catch (err) {
          allOk = false;
          console.error('admin digest enqueue err:', err);
        }
      }
      // Solo registramos UN log de digest por evento+día (la idempotencia ya garantiza no doble envío)
      // Para que el UNIQUE no choque, usamos el primer installment del evento como ancla.
      const ancla = (insts as InstRow[]).find((i) => {
        const r = resMap.get(i.reservation_id);
        return r?.event_id === eventId;
      });
      if (ancla) {
        await supabase.from('reservation_installment_reminders').insert({
          reservation_installment_id: ancla.id,
          offset_days: 0,
          channel: 'admin_alert',
          recipient_type: 'admin',
          recipient_email: emails.join(','),
          status: allOk ? 'sent' : 'failed',
          sent_at: new Date().toISOString(),
          idempotency_key: idemDigest,
        });
      }
      summary.admin_digests_sent++;
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('process-installment-reminders error:', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err), summary }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
