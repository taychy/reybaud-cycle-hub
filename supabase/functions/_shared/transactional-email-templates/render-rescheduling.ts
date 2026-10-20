import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { template, RESCHEDULING_TEMPLATE_VERSION } from './rescheduling-choice.tsx'

/** Same renderer for preview and the actual sender. Never log rendered personal links. */
export function assertReschedulingEncoding(...values: string[]) {
  if (values.some(value => value.includes('\uFFFD'))) {
    throw new Error('La plantilla contiene caracteres inválidos; envío bloqueado')
  }
}

export async function renderReschedulingEmail(data: { firstName?: string; link?: string }) {
  const element = React.createElement(template.component, data)
  const html = await renderAsync(element)
  const text = await renderAsync(element, { plainText: true })
  assertReschedulingEncoding(template.subject, html, text)
  return { subject: template.subject, html, text, template_version: RESCHEDULING_TEMPLATE_VERSION }
}