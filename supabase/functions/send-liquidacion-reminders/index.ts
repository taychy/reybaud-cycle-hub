/**
 * Recordatorios de liquidación mensual a profesores.
 *
 * Corre a diario (cron ~09:00 ART) y solo envía cuando corresponde:
 *  - 3 días antes del último día del mes → `pre_cierre` del mes actual
 *  - día 1 → `post_cierre` del mes anterior
 * Solo a profesores activos con email y SIN envío (liquidacion_submissions) del mes.
 * Idempotencia: liquidacion_reminder_log unique(coach_id, mes, tipo).
 *
 * Modo prueba: body { test_email } con JWT de super_admin. No crea submission,
 * no genera token real ni escribe en el log de idempotencia.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendManagedEmail } from '../_shared/send-managed-email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = (Deno.env.get('PUBLIC_APP_URL') || 'https://reybaud-app.com').replace(/\/$/, '')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

function todayART(): { y: number; m: number; d: number } {
  const art = new Date(Date.now() - 3 * 3600 * 1000)
  return { y: art.getUTCFullYear(), m: art.getUTCMonth() + 1, d: art.getUTCDate() }
}
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const mesLabel = (mes: string) => {
  const [y, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function buildEmail(nombre: string, mes: string, link: string, tipo: 'pre_cierre' | 'post_cierre') {
  const label = mesLabel(mes)
  const subject = `Recordatorio: revisá y completá tu liquidación de ${label}`
  const intro = tipo === 'pre_cierre'
    ? `Se acerca el cierre de ${label} (último día del mes).`
    : `Cerró ${label} y todavía no recibimos la confirmación de tu liquidación.`
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,sans-serif;color:#1a1a1a">
<div style="max-width:520px;margin:0 auto;padding:28px 24px">
<p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#ef7d22;margin:0 0 8px">Liquidación · ${esc(label)}</p>
<h1 style="font-size:22px;margin:0 0 16px">Hola ${esc(nombre)}</h1>
<p style="font-size:15px;line-height:1.5">${esc(intro)}</p>
<p style="font-size:15px;line-height:1.5">Las clases registradas en la app ya aparecen cargadas. Solo tenés que revisarlas, agregar lo que falte (planillas, reuniones, capacitaciones, viáticos o reintegros) y enviar.</p>
<p style="margin:28px 0"><a href="${link}" style="background:#ef7d22;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:8px;font-weight:bold;display:inline-block">Revisar mi liquidación</a></p>
<p style="font-size:13px;color:#666;line-height:1.5">El link es personal: no lo reenvíes. Cualquier duda, escribinos.</p>
<p style="font-size:14px;margin-top:24px">¡Gracias!<br/>Equipo Reybaud</p>
</div></body></html>`
  return { subject, html }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  let body: any = {}
  try { body = await req.json() } catch { body = {} }

  // ---------- Modo prueba (solo super_admin) ----------
  if (body?.test_email) {
    const auth = req.headers.get('Authorization') || ''
    const { data: u } = await admin.auth.getUser(auth.replace('Bearer ', ''))
    if (!u?.user) return json({ error: 'No autorizado' }, 401)
    const { data: isSuper } = await admin.rpc('is_super_admin', { _user_id: u.user.id })
    if (!isSuper) return json({ error: 'Solo super admin' }, 403)
    const email = String(body.test_email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return json({ error: 'Email inválido' }, 400)
    const t = todayART()
    const mes = typeof body.mes === 'string' && /^\d{4}-\d{2}$/.test(body.mes) ? body.mes : ym(t.y, t.m)
    const { subject, html } = buildEmail('Profe (prueba)', mes, `${APP_URL}/liquidacion/cargar/ejemplo`, 'pre_cierre')
    const r = await sendManagedEmail({
      to: email, subject: `[PRUEBA] ${subject}`, html, label: 'liquidacion-reminder-test',
      idempotencyKey: `liq-reminder-test-${crypto.randomUUID()}`, supabase: admin,
    })
    return json({ sent: r.sent, reason: r.sent ? undefined : r.reason })
  }

  // ---------- Ejecución diaria ----------
  const t = todayART()
  const lastDay = new Date(Date.UTC(t.y, t.m, 0)).getUTCDate()
  let tipo: 'pre_cierre' | 'post_cierre' | null = null
  let mes = ''
  if (t.d === lastDay - 3) { tipo = 'pre_cierre'; mes = ym(t.y, t.m) }
  else if (t.d === 1) { tipo = 'post_cierre'; mes = t.m === 1 ? ym(t.y - 1, 12) : ym(t.y, t.m - 1) }
  if (!tipo) return json({ skipped: true, reason: 'not_due' })

  const [{ data: coaches, error: cErr }, { data: subs }] = await Promise.all([
    admin.from('coaches').select('id, nombre, email').eq('estado', 'activo').not('email', 'is', null),
    admin.from('liquidacion_submissions').select('coach_id').eq('mes', mes),
  ])
  if (cErr) return json({ error: cErr.message }, 500)
  const enviados = new Set((subs || []).map((s: any) => s.coach_id))
  const results = { tipo, mes, sent: 0, skipped: 0, suppressed: 0, failed: 0 }

  for (const c of coaches || []) {
    const email = String(c.email || '').trim().toLowerCase()
    if (!email || enviados.has(c.id)) { results.skipped++; continue }

    // Reclamo idempotente: solo continúa si no existe o si el intento anterior falló.
    const { error: insErr } = await admin.from('liquidacion_reminder_log')
      .insert({ coach_id: c.id, mes, tipo, email, status: 'sending' })
    if (insErr) {
      const { data: retry } = await admin.from('liquidacion_reminder_log')
        .update({ status: 'sending', updated_at: new Date().toISOString() })
        .eq('coach_id', c.id).eq('mes', mes).eq('tipo', tipo).eq('status', 'failed').select('id')
      if (!retry || retry.length === 0) { results.skipped++; continue }
    }

    try {
      const { data: token, error: tErr } = await admin.rpc('service_liquidacion_link', { p_coach_id: c.id, p_mes: mes })
      if (tErr || !token) throw new Error(tErr?.message || 'token')
      const { subject, html } = buildEmail(c.nombre || 'profe', mes, `${APP_URL}/liquidacion/cargar/${token}`, tipo)
      const r = await sendManagedEmail({
        to: email, subject, html, label: 'liquidacion-reminder',
        idempotencyKey: `liq-reminder-${tipo}-${c.id}-${mes}`, supabase: admin,
      })
      const status = r.sent ? 'sent' : r.reason === 'recipient_suppressed' ? 'suppressed' : 'failed'
      await admin.from('liquidacion_reminder_log').update({
        status, message_id: r.messageId, error: r.sent ? null : (r as any).error?.slice(0, 500) ?? r.reason,
        updated_at: new Date().toISOString(),
      }).eq('coach_id', c.id).eq('mes', mes).eq('tipo', tipo)
      if (status === 'sent') results.sent++
      else if (status === 'suppressed') results.suppressed++
      else results.failed++
    } catch (e) {
      await admin.from('liquidacion_reminder_log').update({
        status: 'failed', error: String((e as Error).message).slice(0, 500), updated_at: new Date().toISOString(),
      }).eq('coach_id', c.id).eq('mes', mes).eq('tipo', tipo)
      results.failed++
    }
  }
  return json(results)
})
