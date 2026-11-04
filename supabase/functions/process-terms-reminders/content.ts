// Contenido de recordatorios de aceptación de condiciones (puro, testeable).
// Nunca se pide pago: el recordatorio es solo sobre las condiciones.

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export interface ReminderRow {
  nombre: string | null
  apellido: string | null
  event_title: string
  package_nombre: string | null
}

const first = (n: string | null) => (n || '').trim().split(/\s+/)[0] || ''

export function participantEmail(row: ReminderRow, link: string) {
  const hola = first(row.nombre) ? `Hola ${esc(first(row.nombre))},` : 'Hola,'
  const subject = `Falta aceptar las condiciones de tu reserva · ${row.event_title}`
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#ffffff;color:#1a1a1a;padding:20px;">
<div style="max-width:560px;margin:0 auto;">
<h2 style="color:#e07b00;font-family:'Oswald',Arial,sans-serif;">Te falta un paso</h2>
<p>${hola}</p>
<p>Tu reserva para <strong>${esc(row.event_title)}</strong>${row.package_nombre ? ` (${esc(row.package_nombre)})` : ''} está registrada, pero todavía no aceptaste las condiciones del viaje.</p>
<p>Podés leerlas y aceptarlas desde este enlace personal (no lo compartas):</p>
<p style="margin:24px 0;"><a href="${esc(link)}" style="background:#e07b00;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold;">Ver y aceptar condiciones</a></p>
<p style="color:#666;font-size:13px;">Si tenés dudas, respondé este correo o escribinos por WhatsApp.</p>
<p style="color:#666;font-size:12px;">Reybaud Ciclismo</p>
</div></body></html>`
  const text = `${hola.replace(/&[^;]+;/g, '')}\n\nTu reserva para ${row.event_title} está registrada, pero todavía no aceptaste las condiciones del viaje.\nAceptalas desde tu enlace personal (no lo compartas): ${link}\n\nReybaud Ciclismo`
  return { subject, html, text }
}

export function whatsappSuggestion(row: ReminderRow) {
  const n = first(row.nombre)
  return `Hola${n ? ` ${n}` : ''}! Te escribimos de Reybaud por tu reserva para ${row.event_title}. Nos falta que aceptes las condiciones del viaje: te las mandamos por mail con un enlace personal. ¿Lo pudiste ver? Si no te llegó, avisanos y te lo reenviamos. ¡Gracias!`
}

export function adminEmail(row: ReminderRow & { days_since: number }, adminUrl: string) {
  const full = [row.nombre, row.apellido].filter(Boolean).join(' ') || 'Participante sin nombre'
  const wa = whatsappSuggestion(row)
  const subject = `Condiciones sin aceptar (día ${row.days_since}) · ${full} · ${row.event_title}`
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#ffffff;color:#1a1a1a;padding:20px;">
<div style="max-width:600px;margin:0 auto;">
<h2 style="color:#e07b00;">Seguimiento de condiciones pendientes</h2>
<p><strong>${esc(full)}</strong> todavía no aceptó las condiciones de <strong>${esc(row.event_title)}</strong>${row.package_nombre ? ` (${esc(row.package_nombre)})` : ''}. La reserva tiene ${row.days_since} días.</p>
<p>Texto sugerido para WhatsApp (revisalo antes de enviarlo; no se envía automáticamente):</p>
<pre style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:6px;font-family:Arial,sans-serif;">${esc(wa)}</pre>
<p><a href="${esc(adminUrl)}">Abrir el viaje en administración</a></p>
</div></body></html>`
  return { subject, html, whatsapp: wa }
}
