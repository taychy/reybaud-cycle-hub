import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendRegisteredTemplate } from '../_shared/send-managed-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData } = await userClient.auth.getUser()
    const user = userData?.user
    if (!user) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' })
    const { data: isSuper } = await admin.rpc('has_role', {
      _user_id: user.id,
      _role: 'super_admin',
    })
    if (!isAdmin && !isSuper) return json({ error: 'forbidden' }, 403)

    const body = await req.json()
    const recipientEmail: string = (body?.recipientEmail || '').trim()
    const templateData = body?.templateData ?? {}
    const idempotencyKey: string | undefined = body?.idempotencyKey

    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return json({ error: 'recipientEmail inválido' }, 400)
    }

    const result = await sendRegisteredTemplate('supplier-order-created', recipientEmail, {
      templateData,
      idempotencyKey,
      supabase: admin,
    })

    if (!result.sent && result.reason === 'recipient_suppressed') {
      return json({ ok: true, sent: false, reason: 'recipient_suppressed' })
    }
    if (!result.sent) return json({ error: result.error || 'send_failed' }, 500)

    return json({ ok: true, sent: true })
  } catch (e: any) {
    console.error('send-supplier-order-email error', e?.message)
    return json({ error: e?.message || 'internal_error' }, 500)
  }
})
