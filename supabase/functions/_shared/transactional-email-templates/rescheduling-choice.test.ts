import { assertReschedulingEncoding, renderReschedulingEmail } from './render-rescheduling.ts'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

Deno.test('San Luis actual sender renders UTF-8 HTML and plain text without replacement characters', async () => {
  const sample = 'https://reybaud-app.com/reprogramacion/ejemplo'
  const rendered = await renderReschedulingEmail({ firstName: 'María Núñez', link: sample })
  assert(rendered.template_version === 'san-luis-nov-2026-v3-refund-5-7-habiles', 'Wrong template version')
  assert(rendered.subject === 'Training Camp San Luis · Elegí cómo querés continuar', 'Subject changed')
  for (const body of [rendered.html, rendered.text]) {
    assert(!body.includes('\uFFFD'), 'Corrupt Unicode')
    assert(body.includes('María') && body.includes('Núñez'), 'Accents lost')
    assert(body.includes('- Pedir un crédito nominal en pesos para otro Training Camp.'), 'Credit bullet corrupt')
    assert(body.includes('devolución del 100%'), 'Refund policy changed')
    assert(body.includes('reintegros previos'), 'Reimbursements omitted')
    assert(body.includes('Plazo de reintegro: 5 a 7 días hábiles.'), 'Refund timeframe missing')
    assert(!/crédito[^\n<]*días hábiles/.test(body), 'Timeframe leaked to credit')
    assert(body.includes('Si tenés dudas'), 'Help missing')
    assert(body.includes(sample), 'Link changed')
  }
  assert(!/<(?:p|div|html)\b/.test(rendered.text), 'Plain text contains markup')
  assert((rendered.html.match(/>Elegir mi opción</g) ?? []).length === 1, 'Duplicate CTA')
})

Deno.test('San Luis rejects already-corrupt output before calling any provider', () => {
  let rejected = false
  try { assertReschedulingEncoding('�� Pedir un crédito') } catch { rejected = true }
  assert(rejected, 'Corruption must block sending')
})