/**
 * Cron diario. Recordatorios de aceptación de condiciones para TODOS los viajes:
 *  - Día 5 desde la creación: email al participante con su enlace personal.
 *  - Día 10: email a administración con texto sugerido de WhatsApp (envío humano).
 * Elegibilidad y reclamo atómico en SQL (terms_reminder_candidates / _claim):
 * no se envía si aceptó o canceló, una sola notificación por (reserva, tipo),
 * solo reservas creadas desde app_config.terms_reminders_config.since.
 * El token nunca se registra: se oculta del historial de correos.
 * Body opcional { dry_run: true } → solo cuenta candidatos, sin enviar.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendManagedEmail } from '../_shared/send-managed-email.ts'
import { adminEmail, participantEmail } from './content.ts'

const PUBLIC_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncWZha2Zsb29uYnVud2tkb3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDcwNjcsImV4cCI6MjA4NzUyMzA2N30.wESViBAO2oP0aTSIrgXVkIS8qJXgW4f0GtKWShHuf_o'
const SITE = 'https://reybaud-app.com'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function alertEmails(sb: any, eventId: string): Promise<string[]> {
  const { data: ev } = await sb.from('events').select('admin_alert_emails').eq('id', eventId).maybeSingle()
  if (Array.isArray(ev?.admin_alert_emails) && ev.admin_alert_emails.length) return ev.admin_alert_emails
  const { data } = await sb.from('app_config').select('value').eq('key', 'default_payment_alert_emails').maybeSingle()
  const v = data?.value
  return Array.isArray(v) ? v : Array.isArray(v?.emails) ? v.emails : []
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  // Clave pública del proyecto (la misma que usa el cron); el proceso es idempotente.
  const anons = [Deno.env.get('SUPABASE_ANON_KEY'), Deno.env.get('SUPABASE_PUBLISHABLE_KEY'), PUBLIC_ANON].filter(Boolean)
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const key = req.headers.get('apikey') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!key || (!anons.includes(key) && key !== service)) return json({ error: 'unauthorized' }, 401)

  let dry = false
  try { dry = (await req.json())?.dry_run === true } catch { /* sin body */ }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, service)
  const { data: rows, error } = await sb.rpc('terms_reminder_candidates')
  if (error) return json({ error: 'candidates_failed' }, 500)
  const summary = { candidates: rows?.length ?? 0, sent: 0, skipped: 0, failed: 0, suppressed: 0, dry_run: dry }
  if (dry) return json(summary)

  for (const r of rows ?? []) {
    const recipients = r.kind === 'participante_d5' ? [r.recipient] : await alertEmails(sb, r.event_id)
    if (!recipients.length) { summary.skipped++; continue }
    const { data: claim } = await sb.rpc('terms_reminder_claim', {
      p_reservation_id: r.reservation_id, p_kind: r.kind, p_recipient: recipients.join(', '),
    })
    if (!claim?.claimed) { summary.skipped++; continue }

    let status: 'enviado' | 'error' | 'suprimido' = 'enviado'
    let err: string | null = null
    try {
      if (r.kind === 'participante_d5') {
        const link = `${SITE}/condiciones/${claim.token}`
        const m = participantEmail(r, link)
        const res = await sendManagedEmail({
          to: r.recipient, subject: m.subject, html: m.html, text: m.text, label: 'terms_reminder_participant',
          idempotencyKey: `terms-reminder-d5-${r.reservation_id}`, redact: [claim.token], supabase: sb,
        })
        if (!res.sent) { status = res.reason === 'recipient_suppressed' ? 'suprimido' : 'error'; err = res.reason === 'failed' ? (res.error ?? 'failed') : null }
      } else {
        const m = adminEmail(r, `${SITE}/admin/eventos`)
        let ok = 0
        for (const to of recipients) {
          const res = await sendManagedEmail({
            to, subject: m.subject, html: m.html, label: 'terms_reminder_admin',
            idempotencyKey: `terms-reminder-d10-${r.reservation_id}-${to.toLowerCase()}`, supabase: sb,
          })
          if (res.sent) ok++; else if (res.reason === 'failed') err = res.error ?? 'failed'
        }
        if (!ok) status = err ? 'error' : 'suprimido'
      }
    } catch (e) { status = 'error'; err = e instanceof Error ? e.message : String(e) }

    await sb.rpc('terms_reminder_finish', { p_id: claim.id, p_status: status, p_error: err })
    if (status === 'enviado') summary.sent++; else if (status === 'suprimido') summary.suppressed++; else summary.failed++
  }
  return json(summary)
})
