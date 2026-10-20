// Email operativo de reprogramación (un correo por titular, sin lista de marketing).
// Modos: preview (sin tokens), test (a la cuenta del admin, enlace sin token) y send (lote ≤10, compuertas en servidor).
// Nunca se registra ni devuelve el enlace personal o el token.
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'
import { template, RESCHEDULING_TEMPLATE_VERSION } from '../_shared/transactional-email-templates/rescheduling-choice.tsx'

const PRODUCTION_ORIGIN = 'https://reybaud-app.com'
const TEMPLATE = 'rescheduling-choice'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const personalLink = (eventId: string, reservationId: string, token: string) =>
  `${PRODUCTION_ORIGIN}/reprogramacion/${eventId}?${new URLSearchParams({ reserva: reservationId, token })}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  try {
    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401)
    const url = Deno.env.get('SUPABASE_URL')!
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: u } = await userClient.auth.getUser()
    if (!u?.user) return json({ error: 'No autorizado' }, 401)
    const { data: isAdmin } = await userClient.rpc('_rescheduling_admin')
    if (isAdmin !== true) return json({ error: 'Acceso no autorizado' }, 403)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const body = await req.json().catch(() => ({}))
    const mode = String(body.mode ?? '')
    const eventId = String(body.event_id ?? '')
    if (!UUID.test(eventId)) return json({ error: 'Evento inválido' }, 400)
    const { data: camp } = await admin.from('event_rescheduling_campaigns').select('event_id, public_enabled').eq('event_id', eventId).maybeSingle()
    if (!camp) return json({ error: 'El evento no tiene reprogramación' }, 404)

    if (mode === 'preview') {
      const html = await renderAsync(React.createElement(template.component, {
        firstName: 'Nombre', link: `${PRODUCTION_ORIGIN}/reprogramacion/${eventId}?reserva=…&token=••••`,
      }))
      return json({ subject: template.subject, html, template_version: RESCHEDULING_TEMPLATE_VERSION })
    }

    if (mode === 'test') {
      if (body.confirm !== true) return json({ error: 'Falta confirmar la prueba' }, 400)
      const to = (u.user.email ?? '').toLowerCase()
      if (!to) return json({ error: 'Tu cuenta no tiene email' }, 400)
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { count } = await admin.from('rescheduling_email_test_log').select('id', { count: 'exact', head: true }).eq('actor_id', u.user.id).gte('created_at', since)
      if ((count ?? 0) >= 3) return json({ error: 'Límite de pruebas: esperá unos minutos' }, 429)
      // Enlace de muestra SIN token: nunca se envía el enlace personal de un participante al admin.
      let result = 'aceptado'
      try {
        const r = await sendTemplateEmail(TEMPLATE, to, {
          templateData: { firstName: 'Prueba', link: `${PRODUCTION_ORIGIN}/reprogramacion/${eventId}` },
          idempotencyKey: `resched-test-${eventId}-${crypto.randomUUID()}`,
        })
        if (!r.sent) result = 'suprimido'
      } catch (e) {
        result = 'error'
        console.error('rescheduling test send failed', (e as Error)?.message)
      }
      await admin.from('rescheduling_email_test_log').insert({ event_id: eventId, actor_id: u.user.id, recipient: to, result })
      return json({ result, recipient: to }, result === 'error' ? 502 : 200)
    }

    if (mode === 'send') {
      if (body.confirm !== 'ENVIAR') return json({ error: 'Falta la confirmación expresa' }, 400)
      const ids = Array.isArray(body.reservation_ids) ? body.reservation_ids.filter((x: unknown) => typeof x === 'string' && UUID.test(x)) : []
      if (!ids.length || ids.length > 10) return json({ error: 'Lote inválido (1 a 10 reservas)' }, 400)
      if (!camp.public_enabled) return json({ error: 'Encuesta cerrada: envío bloqueado' }, 409)
      const { data: claimed, error: cErr } = await admin.rpc('_rescheduling_email_claim', { p_event_id: eventId, p_reservation_ids: ids, p_actor: u.user.id })
      if (cErr) return json({ error: cErr.message }, 409)
      const results: { reservation_id: string; status: string }[] = []
      for (const c of (claimed ?? []) as { reservation_id: string; email: string; first_name: string; token: string }[]) {
        let ok = false, note = ''
        try {
          const r = await sendTemplateEmail(TEMPLATE, c.email, {
            templateData: { firstName: (c.first_name ?? '').trim(), link: personalLink(eventId, c.reservation_id, c.token) },
            idempotencyKey: `resched-email-${c.reservation_id}`,
          })
          ok = r.sent
          note = r.sent ? 'Aceptado por el proveedor (no confirma entrega)' : 'Destinatario suprimido'
        } catch (e) {
          note = `Error del proveedor: ${String((e as Error)?.message ?? '').slice(0, 200)}`
        }
        await admin.rpc('_rescheduling_email_finish', { p_reservation_id: c.reservation_id, p_ok: ok, p_note: note, p_actor: u.user.id })
        results.push({ reservation_id: c.reservation_id, status: ok ? 'enviado' : 'fallido' })
      }
      return json({ requested: ids.length, processed: results.length, skipped: ids.length - results.length, results })
    }

    return json({ error: 'Modo inválido' }, 400)
  } catch (e) {
    console.error('send-rescheduling-email error', (e as Error)?.message)
    return json({ error: 'Error interno' }, 500)
  }
})
