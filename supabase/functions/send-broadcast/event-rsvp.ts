const PUBLIC_ORIGIN = "https://reybaud-app.com";
const emailKey = (value: unknown) => String(value || "").trim().toLowerCase();
const money = (value: unknown) => new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(Number(value || 0));

export type RsvpBroadcastKind = "invitacion" | "almuerzo";
export type RsvpSegment = { rsvp_event_id?: string; rsvp_kind?: RsvpBroadcastKind };

function assertSegment(segment: RsvpSegment) {
  if (!segment.rsvp_event_id) return false;
  if (!/^[0-9a-f-]{36}$/i.test(segment.rsvp_event_id)) throw new Error("Evento RSVP inválido");
  if (!["invitacion", "almuerzo"].includes(segment.rsvp_kind || "")) throw new Error("Tipo de correo RSVP inválido");
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
  if (segment.rsvp_kind !== "almuerzo") return rows;
  const emails = rows.map((r) => emailKey(r.email)).filter(Boolean);
  if (!emails.length) return [];
  const { data, error } = await admin.from("event_rsvp_invites")
    .select("recipient_email,participation_mode,cyclist_guests")
    .eq("event_id", segment.rsvp_event_id).eq("is_test", false)
    .eq("response", "voy").in("recipient_email", emails);
  if (error) throw error;
  // Segundo correo: interesados en parrilla O quienes traen amigos ciclistas,
  // incluso si el alumno eligió "solo fondo".
  const eligible = new Set((data || []).filter((r: any) =>
    ["fondo_y_almuerzo", "solo_almuerzo"].includes(r.participation_mode) ||
    (Array.isArray(r.cyclist_guests) && r.cyclist_guests.length > 0)
  ).map((r: any) => emailKey(r.recipient_email)));
  return rows.filter((r) => eligible.has(emailKey(r.email)));
}

/** Crea/recupera el enlace individual justo antes de una prueba o envío, nunca en preview_count. */
export async function decorateRsvpRecipients(admin: any, rows: any[], segment: RsvpSegment, isTest = false) {
  if (!assertSegment(segment)) return rows;
  const prices = await eventAndPrices(admin, segment);
  const decorated: any[] = [];
  for (const recipient of rows) {
    const email = emailKey(recipient.email);
    if (!email) continue;
    let confirmed: any = null;
    if (segment.rsvp_kind === "almuerzo" && !isTest) {
      const { data: interest } = await admin.from("event_rsvp_invites")
        .select("id,participation_mode,cyclist_guests,non_cyclist_guests")
        .eq("event_id", segment.rsvp_event_id).eq("recipient_email", email).eq("is_test", false)
        .eq("response", "voy").maybeSingle();
      if (!interest || !(["fondo_y_almuerzo", "solo_almuerzo"].includes(interest.participation_mode) ||
        (Array.isArray(interest.cyclist_guests) && interest.cyclist_guests.length > 0))) continue;
      confirmed = interest;
    }
    const payload: Record<string, unknown> = {
      event_id: segment.rsvp_event_id,
      recipient_email: email,
      recipient_name: recipient.display_name || recipient.name || "Ciclista",
      alumno_id: recipient.contact_type === "alumno" ? recipient.id : null,
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
    let paymentSummary = "";
    if (segment.rsvp_kind === "almuerzo" && confirmed && prices) {
      const riders = Array.isArray(confirmed.cyclist_guests) ? confirmed.cyclist_guests : [];
      const non = Array.isArray(confirmed.non_cyclist_guests) ? confirmed.non_cyclist_guests : [];
      if (["fondo_y_almuerzo", "solo_almuerzo"].includes(confirmed.participation_mode)) {
        const adults = 1 + non.filter((person: any) => person.category === "adult").length +
          riders.filter((person: any) => person.lunch === true).length;
        const children = non.filter((person: any) => person.category === "child_4_9").length;
        const under4 = non.filter((person: any) => person.category === "under_4").length;
        const total = adults * Number(prices.adult_price) +
          children * Number(prices.child_4_9_price) + under4 * Number(prices.under_4_price);
        paymentSummary += `<p style="border:1px solid #1883a4;background:#132a34;padding:14px;border-radius:10px">
          <strong>Tu parrilla:</strong> ${adults} adulto(s), ${children} niño(s) de 4 a 9, ${under4} menor(es) de 4.
          <br><strong>Total del restaurante: ${money(total)}</strong></p>`;
      }
      if (riders.length > 0) {
        paymentSummary += `<p style="border:1px solid #a86930;background:#2d221b;padding:14px;border-radius:10px">
          Solicitaste ${riders.length} amigo(s) ciclista(s). El fondo cuesta
          <strong>${money(30000)} por invitado aprobado</strong>.
          Confirmá primero con Claudio cuáles están autorizados. No transfieras por una solicitud todavía no aprobada.</p>`;
      }
    }
    decorated.push({
      ...recipient,
      rsvp_voy_url: `${base}?opcion=voy`,
      rsvp_no_voy_url: `${base}?opcion=no_voy`,
      rsvp_lunch_url: `${base}?seccion=almuerzo`,
      rsvp_adult_price: money(prices?.adult_price),
      rsvp_child_price: money(prices?.child_4_9_price),
      rsvp_under_4_price: money(prices?.under_4_price),
      rsvp_payment_summary_html: paymentSummary,
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
