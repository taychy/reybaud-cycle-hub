import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { EmailAPIError, sendLovableEmail } from 'npm:@lovable.dev/email-js@0.1.0'
import { TEMPLATES } from './transactional-email-templates/registry.ts'

// Server-only helper for feature senders that compose their own HTML.
// Sends synchronously through Lovable's managed email API (delivery, retries,
// suppression and unsubscribe are handled by Lovable) and keeps the project's
// own `email_send_log` history intact.

const SITE_NAME = 'Ciclismo Reybaud'
const SENDER_DOMAIN = 'notify.reybaud-app.com'
const FROM_DOMAIN = 'notify.reybaud-app.com'

export type SendManagedEmailResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: 'recipient_suppressed' | 'failed'; messageId: string; error?: string }

export interface SendManagedEmailArgs {
  to: string
  subject: string
  html: string
  /** Plain-text alternative; derived from the HTML when omitted. */
  text?: string
  /** Stored as `template_name` in email_send_log. */
  label: string
  idempotencyKey?: string
  fromName?: string
  replyTo?: string
  /** Optional service-role client; one is created from env when omitted. */
  supabase?: any
}

function htmlToText(html: string, fallback: string): string {
  const text = (html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || fallback
}

function getClient(supabase?: any) {
  if (supabase) return supabase
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  return createClient(url, key)
}

async function log(supabase: any, row: Record<string, unknown>): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('email_send_log').insert(row)
  if (error) {
    console.error('email_send_log insert failed', { code: error.code, message: error.message })
  }
}

/**
 * Sends one email to one recipient through Lovable's managed email API.
 * A suppressed recipient is an expected outcome, not an error.
 */
export async function sendManagedEmail(args: SendManagedEmailArgs): Promise<SendManagedEmailResult> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) throw new Error('LOVABLE_API_KEY is not configured')

  const supabase = getClient(args.supabase)
  const messageId = crypto.randomUUID()
  const text = args.text && args.text.trim() ? args.text : htmlToText(args.html, args.subject)
  const payload = {
    to: args.to,
    from: `${args.fromName || SITE_NAME} <noreply@${FROM_DOMAIN}>`,
    sender_domain: SENDER_DOMAIN,
    subject: args.subject,
    html: args.html,
    text,
    purpose: 'transactional' as const,
    label: args.label,
    idempotency_key: args.idempotencyKey || messageId,
    reply_to: args.replyTo,
    message_id: messageId,
  }

  try {
    try {
      await sendLovableEmail(payload, { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') })
    } catch (error) {
      // Rate limited: wait the advertised cooldown once, then retry.
      if (error instanceof EmailAPIError && error.status === 429) {
        const waitSeconds = error.retryAfterSeconds ?? 60
        await new Promise((r) => setTimeout(r, waitSeconds * 1000))
        await sendLovableEmail(payload, { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') })
      } else {
        throw error
      }
    }
  } catch (error) {
    if (error instanceof EmailAPIError && error.code === 'recipient_suppressed') {
      await log(supabase, {
        message_id: messageId,
        template_name: args.label,
        recipient_email: args.to,
        status: 'suppressed',
      })
      return { sent: false, reason: 'recipient_suppressed', messageId }
    }
    const message = error instanceof Error ? error.message : String(error)
    await log(supabase, {
      message_id: messageId,
      template_name: args.label,
      recipient_email: args.to,
      status: 'failed',
      error_message: message.slice(0, 1000),
    })
    return { sent: false, reason: 'failed', messageId, error: message }
  }

  await log(supabase, {
    message_id: messageId,
    template_name: args.label,
    recipient_email: args.to,
    status: 'sent',
    metadata: {
      snapshot: {
        subject: args.subject,
        html: args.html ? args.html.slice(0, 200000) : null,
        text: text ? text.slice(0, 50000) : null,
      },
    },
  })

  return { sent: true, messageId }
}

/**
 * Compatibility shim for feature senders that already build a full email
 * payload (recipient, subject, html, text, label, idempotency key).
 * Sends it synchronously through Lovable's managed email API and mirrors the
 * `{ error }` result shape the previous transport returned.
 */
export async function sendLegacyEmailPayload(
  payload: Record<string, any>,
  supabase?: any,
): Promise<{ error: { message: string } | null; sent: boolean; reason?: string }> {
  const to = payload?.to
  if (!to) return { error: { message: 'Recipient is required' }, sent: false, reason: 'failed' }

  const fromName = typeof payload.from === 'string' ? payload.from.split('<')[0].trim() : undefined
  const result = await sendManagedEmail({
    to,
    subject: payload.subject ?? '',
    html: payload.html ?? '',
    text: payload.text,
    label: payload.label ?? payload.template_name ?? 'transactional',
    idempotencyKey: payload.idempotency_key ?? payload.message_id,
    fromName: fromName || undefined,
    replyTo: payload.reply_to,
    supabase,
  })

  if (result.sent) return { error: null, sent: true }
  if (result.reason === 'recipient_suppressed') return { error: null, sent: false, reason: 'recipient_suppressed' }
  return { error: { message: result.error ?? 'Email send failed' }, sent: false, reason: 'failed' }
}

/**
 * Renders a registered template and sends it through Lovable's managed email
 * API, keeping the project's `email_send_log` history.
 */
export async function sendRegisteredTemplate(
  templateName: string,
  to: string,
  options: {
    templateData?: Record<string, any>
    idempotencyKey?: string
    replyTo?: string
    supabase?: any
  } = {},
): Promise<SendManagedEmailResult> {
  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
    )
  }
  const recipient = template.to || to
  if (!recipient) throw new Error('Recipient is required')

  const templateData = options.templateData ?? {}
  const element = React.createElement(template.component, templateData)
  const html = await renderAsync(element)
  const text = await renderAsync(element, { plainText: true })
  const subject =
    typeof template.subject === 'function' ? template.subject(templateData) : template.subject

  return await sendManagedEmail({
    to: recipient,
    subject,
    html,
    text,
    label: templateName,
    idempotencyKey: options.idempotencyKey,
    replyTo: options.replyTo,
    supabase: options.supabase,
  })
}
