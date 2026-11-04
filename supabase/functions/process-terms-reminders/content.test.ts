import { adminEmail, participantEmail, whatsappSuggestion } from './content.ts'

const assert = (c: boolean, m: string) => { if (!c) throw new Error(m) }
const row = { nombre: 'María <b>', apellido: 'Núñez', event_title: 'Viaje Test', package_nombre: 'Doble' }

Deno.test('participante: enlace, escape y sin pedido de pago', () => {
  const e = participantEmail(row, 'https://reybaud-app.com/condiciones/abc')
  assert(e.html.includes('/condiciones/abc'), 'link')
  assert(!e.html.includes('<b>'), 'escape')
  assert(!/pag[oa]r|saldo|seña/i.test(e.html + e.text), 'no debe pedir pagos')
})

Deno.test('admin: nombre, viaje, WhatsApp sugerido y sin token', () => {
  const e = adminEmail({ ...row, days_since: 10 }, 'https://reybaud-app.com/admin/eventos')
  assert(e.subject.includes('Núñez') && e.subject.includes('Viaje Test'), 'subject')
  assert(e.html.includes('WhatsApp') && whatsappSuggestion(row).includes('Viaje Test'), 'wa')
  assert(!e.html.includes('/condiciones/'), 'no token link to admin')
  assert(!/saldo|pag[oa]r/i.test(e.whatsapp), 'no pide pagos')
})
