import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type Reason = 'bounce' | 'complaint' | 'unsubscribe'

const LOG_STATUS: Record<Reason, string> = {
  bounce: 'bounced',
  complaint: 'complained',
  unsubscribe: 'suppressed',
}

const LOG_MESSAGE: Record<Reason, string> = {
  bounce: 'Permanent bounce — email address is invalid or rejected',
  complaint: 'Spam complaint — recipient marked email as spam',
  unsubscribe: 'Recipient unsubscribed',
}

async function record(reason: Reason, event: any) {
  const recipient: string = (event?.data?.recipient ?? '').toLowerCase()
  if (!recipient) return

  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert({ email: recipient, reason, metadata: null }, { onConflict: 'email' })
  if (suppressError) {
    console.error('suppressed_emails upsert failed', {
      code: suppressError.code,
      message: suppressError.message,
      event_id: event.event_id,
    })
    throw new Error('suppression write failed')
  }

  const { error: logError } = await supabase.from('email_send_log').insert({
    message_id: event?.data?.message_id ?? null,
    template_name: 'system',
    recipient_email: recipient,
    status: LOG_STATUS[reason],
    error_message: LOG_MESSAGE[reason],
    metadata: null,
  })
  if (logError) {
    console.error('email_send_log insert failed', {
      code: logError.code,
      message: logError.message,
      event_id: event.event_id,
    })
    throw new Error('log write failed')
  }

  if (reason === 'unsubscribe') {
    // Reflejar la baja en la base de marketing para que se vea en el panel.
    const { error: optOutError } = await supabase
      .from('marketing_contacts')
      .update({ opt_in_marketing: false, opt_out_at: new Date().toISOString() })
      .ilike('email', recipient)
    if (optOutError) {
      console.error('marketing_contacts opt-out failed', {
        code: optOutError.code,
        message: optOutError.message,
        event_id: event.event_id,
      })
      throw new Error('marketing opt-out failed')
    }
  }
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await record('bounce', event)
    },
    'email.complaint': async (event) => {
      await record('complaint', event)
    },
    'email.unsubscribed': async (event) => {
      await record('unsubscribe', event)
    },
  },
})

Deno.serve((req) => handler(req))
