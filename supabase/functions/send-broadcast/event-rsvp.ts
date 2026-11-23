import { rsvpReceiptWhatsAppUrl } from "../_shared/event-rsvp-mail.ts";

const PUBLIC_ORIGIN = "https://reybaud-app.com";
const emailKey = (value: unknown) => String(value || "").trim().toLowerCase();
const money = (value: unknown) => new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(Number(value || 0));

export type RsvpBroadcastKind = "invitacion" | "almuerzo" | "recordatorio";
export type RsvpSegment = { rsvp_event_id?: string; rsvp_kind?: RsvpBroadcastKind };

function assertSegment(segment: RsvpSegment) {
  if (!segment.rsvp_event_id) return false;
  if (!/^[0-9a-f-]{36}$/i.test(segment.rsvp_event_id)) throw new Error("Evento RSVP inválido");
  if (!["invitacion", "almuerzo", "recordatorio"].includes(segment.rsvp_kind || "")) throw new Error("Tipo de correo RSVP inválido");
  return true;
}

async function eventAndPrices(admin: any, segment: RsvpSegment) {
  const { data: event, error } = await admin.from("events").select("id,metadata").eq("id", segment.rsvp_event_id).maybeSingle();
  if (error || !event || event.metadata?.rsvp_enabled !== true) throw new Error("El evento no tiene RSVP habilitado");
  if (segment.rsvp_kind !== "almuerzo") return null;
  const { data: prices, error: priceError } = await admin.from("event_rsvp_settings").select("*").eq("event_id", event.id).maybeSingle();
  if (priceError) throw priceError;
  if (!prices?.prices_confirmed_at) throw new Error("Confirmá las tarifas actuales antes de preparar el correo del almuerzo");
  return prices;
}

/** Sólo filtra lecturas de audiencia; una vista previa nunca crea invitaciones. */
export async function filterRsvpRecipients(admin: any, rows: any[], segment: RsvpSegment) {
  if (!assertSegment(segment)) return rows;
  await eventAndPrices(admin, segment);
  if (segment.rsvp_kind === "recordatorio") {
    // Recordatorio: sólo invitaciones reales ya existentes y sin respuesta; nunca crea ni toca invitaciones.
    const pending = await pendingInvitesByEmail(admin, segment, rows.map((r) => emailKey(r.email)).filter(Boolean));
    const seen = new Set<string>();
    return rows.filter((r) => {
      const key = emailKey(r.email);
      if (!pending.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (segment.rsvp_kind !== "almuerzo") return rows;
  const emails = rows.map((r) => emailKey(r.email)).filter(Boolean);
  if (!emails.length) return [];
  const { data, error } = await admin.from("event_rsvp_invites")
    .select("recipient_email").eq("event_id", segment.rsvp_event_id).eq("is_test", false)
    .eq("response", "voy").in("participation_mode", ["fondo_y_almuerzo", "solo_almuerzo"]).in("recipient_email", emails);
  if (error) throw error;
  const eligible = new Set((data || []).map((r: any) => emailKey(r.recipient_email)));
  return rows.filter((r) => eligible.has(emailKey(r.email)));
}

async function pendingInvitesByEmail(admin: any, segment: RsvpSegment, emails: string[]) {
  const map = new Map<string, any>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data, error } = await admin.from("event_rsvp_invites")
      .select("recipient_email,recipient_name,token").eq("event_id", segment.rsvp_event_id).eq("is_test", false)
      .is("response", null).in("recipient_email", emails.slice(i, i + 200));
    if (error) throw error;
    for (const r of data || []) map.set(emailKey(r.recipient_email), r);
  }
  return map;
}

/** Crea/recupera el enlace individual justo antes de una prueba o envío, nunca en preview_count. */
export async function decorateRsvpRecipients(admin: any, rows: any[], segment: RsvpSegment, isTest = false) {
  if (!assertSegment(segment)) return rows;
  const prices = await eventAndPrices(admin, segment);
  if (segment.rsvp_kind === "recordatorio") {
    if (isTest) throw new Error("El recordatorio no admite pruebas: reutiliza sólo enlaces reales existentes");
    const pending = await pendingInvitesByEmail(admin, segment, rows.map((r) => emailKey(r.email)).filter(Boolean));
    return rows.flatMap((recipient) => {
      const invite = pending.get(emailKey(recipient.email));
      if (!invite?.token) return [];
      const name = String(recipient.display_name || recipient.name || invite.recipient_name || "").trim();
      if (!name) throw new Error("Falta el nombre real del perfil; el recordatorio no se preparó con un saludo genérico");
      const base = `${PUBLIC_ORIGIN}/confirmar-asistencia/${invite.token}`;
      return [{ ...recipient, display_name: name, rsvp_voy_url: `${base}?opcion=voy`, rsvp_no_voy_url: `${base}?opcion=no_voy` }];
    });
  }
  const decorated: any[] = [];
  for (const recipient of rows) {
    const email = emailKey(recipient.email);
    if (!email) continue;
    if (segment.rsvp_kind === "almuerzo" && !isTest) {
      const { data: interest } = await admin.from("event_rsvp_invites").select("id")
        .eq("event_id", segment.rsvp_event_id).eq("recipient_email", email).eq("is_test", false)
        .eq("response", "voy").in("participation_mode", ["fondo_y_almuerzo", "solo_almuerzo"]).maybeSingle();
      if (!interest) continue;
    }
    const { data: existing, error: existingError } = await admin.from("event_rsvp_invites")
      .select("alumno_id,recipient_name").eq("event_id", segment.rsvp_event_id)
      .eq("recipient_email", email).eq("is_test", isTest).maybeSingle();
    if (existingError) throw existingError;
    const alumnoId = recipient.contact_type === "alumno" ? recipient.id : existing?.alumno_id || null;
    const realName = String(
      (alumnoId && recipient.contact_type !== "alumno" ? existing?.recipient_name : null) ||
      recipient.display_name || recipient.name || `${recipient.nombre ?? ""} ${recipient.apellido ?? ""}`.trim()
    ).trim();
    if (!isTest && (!realName || realName.toLowerCase() === email)) {
      throw new Error("Falta el nombre real del perfil; la invitación no se preparó con un saludo genérico");
    }
    const recipientName = realName || "Test Reybaud";
    const payload: Record<string, unknown> = {
      event_id: segment.rsvp_event_id,
      recipient_email: email,
      recipient_name: recipientName,
      alumno_id: alumnoId,
      is_test: isTest,
    };
    if (isTest && segment.rsvp_kind === "almuerzo") {
      Object.assign(payload, { response: "voy", participation_mode: "fondo_y_almuerzo", guests_count: 0, lunch_status: "intencion_confirmada" });
    }
    const { data: invite, error } = await admin.from("event_rsvp_invites").upsert(payload, {
      onConflict: "event_id,recipient_email,is_test",
    }).select("token").single();
    if (error || !invite?.token) throw error || new Error("No se pudo preparar el enlace individual");
    const base = `${PUBLIC_ORIGIN}/confirmar-asistencia/${invite.token}`;
    decorated.push({
      ...recipient,
      display_name: recipientName,
      rsvp_voy_url: `${base}?opcion=voy`,
      rsvp_no_voy_url: `${base}?opcion=no_voy`,
      rsvp_lunch_url: `${base}?seccion=almuerzo`,
      rsvp_receipt_whatsapp_url: rsvpReceiptWhatsAppUrl(recipientName),
      rsvp_adult_price: money(prices?.adult_price),
      rsvp_child_price: money(prices?.child_4_9_price),
      rsvp_under_4_price: money(prices?.under_4_price),
    });
  }
  return decorated;
}

export async function markRsvpSent(admin: any, recipient: any, segment: RsvpSegment, isTest = false) {
  if (!assertSegment(segment) || isTest) return;
  const email = emailKey(recipient.email);
  await admin.from("event_rsvp_invites").update({ last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("event_id", segment.rsvp_event_id).eq("recipient_email", email).eq("is_test", false);
  // Los estados del almuerzo los cambia administración con comentario y auditoría.
}
