// Edge function: envía notificación al compañero invitado o mail de confirmación
// cuando la invitación es aceptada. Usa la cola de emails (enqueue_email) y
// registra en reservation_notifications.
//
// Body:
//   { kind: "invite" | "accepted", roommate_id: string }
// - "invite": mail al invitado con Aceptar/Rechazar (link al hub).
// - "accepted": mail al que invitó (y opcionalmente al invitado) confirmando.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Reybaud Ciclismo";
const APP_DOMAIN = "https://reybaud-app.com";

const normalizeEmail = (e: string) => e.trim().toLowerCase();
const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const getOrCreateUnsubscribeToken = async (supabase: any, email: string) => {
  const normalized = normalizeEmail(email);
  const { data: existing } = await supabase.from("email_unsubscribe_tokens").select("token").eq("email", normalized).maybeSingle();
  if (existing?.token) return existing.token;
  const newToken = crypto.randomUUID();
  const { data: inserted } = await supabase.from("email_unsubscribe_tokens").insert({ email: normalized, token: newToken }).select("token").single();
  return inserted?.token || newToken;
};

const shell = (title: string, subtitle: string, bodyHtml: string, ctaLabel: string, ctaHref: string) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#121212;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="font-size:22px;margin:0;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#121212;">${esc(title)}</h1>
      <p style="font-size:13px;color:#888;margin:8px 0 0;">${esc(subtitle)}</p>
    </div>
    ${bodyHtml}
    <div style="text-align:center;margin:28px 0 12px;">
      <a href="${esc(ctaHref)}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#E8832A,#F0A05C);color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
        ${esc(ctaLabel)}
      </a>
    </div>
    <p style="font-size:11px;color:#999;text-align:center;margin-top:24px;line-height:1.5;">
      Ciclismo Reybaud · ${new Date().getFullYear()}
    </p>
  </div>
</body></html>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { kind, roommate_id } = await req.json();
    if (!roommate_id || !["invite", "accepted"].includes(kind)) {
      return new Response(JSON.stringify({ error: "invalid body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: rm } = await supabase.from("reservation_roommates").select("*").eq("id", roommate_id).maybeSingle();
    if (!rm) return new Response(JSON.stringify({ error: "roommate not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: reservation } = await supabase
      .from("event_reservations")
      .select("id, event_id, alumno_id, package_nombre_snapshot")
      .eq("id", rm.reservation_id).maybeSingle();
    if (!reservation) return new Response(JSON.stringify({ error: "reservation not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: event } = await supabase.from("events").select("id, title, date, end_date, location").eq("id", reservation.event_id).maybeSingle();
    const { data: inviter } = await supabase.from("alumnos").select("nombre, apellido, email").eq("id", reservation.alumno_id).maybeSingle();

    const eventLink = `${APP_DOMAIN}/eventos/${event?.id || ""}`;
    const inviterName = [inviter?.nombre, inviter?.apellido].filter(Boolean).join(" ").trim() || (inviter?.email || "un compañero");
    const paquete = reservation.package_nombre_snapshot || "el paquete elegido";

    let recipientEmail = "";
    let subject = "";
    let html = "";
    let text = "";
    let idempotencyKey = "";
    let label = "";

    if (kind === "invite") {
      recipientEmail = rm.email || "";
      if (!recipientEmail) {
        return new Response(JSON.stringify({ error: "no recipient email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      subject = `${inviterName} te invita a compartir habitación – ${event?.title || "Viaje"}`;
      idempotencyKey = `roommate-invite-${rm.id}`;
      label = "roommate_invite";
      const body = `
        <p style="font-size:15px;line-height:1.55;">Hola,</p>
        <p style="font-size:15px;line-height:1.55;">
          <strong>${esc(inviterName)}</strong> te invitó a compartir habitación en <strong>${esc(event?.title || "el viaje")}</strong>.
        </p>
        <div style="border:1px solid #eee;border-radius:10px;padding:16px 18px;margin:16px 0;background:#fafafa;">
          <p style="margin:0 0 6px;font-size:13px;color:#888;">Paquete elegido</p>
          <p style="margin:0;font-weight:600;">${esc(paquete)}</p>
        </div>
        <p style="font-size:14px;color:#444;line-height:1.55;">
          Podés aceptar o rechazar la invitación desde tu Hub del viaje. Si aceptás, quedarán vinculados y el admin los ubicará en la misma habitación.
        </p>`;
      html = shell("Invitación de habitación", event?.title || "", body, "Ir a mi viaje", eventLink);
      text = `${inviterName} te invitó a compartir habitación en ${event?.title || "el viaje"}. Paquete: ${paquete}. Aceptá o rechazá desde tu viaje: ${eventLink}`;
    } else {
      // accepted → notify the inviter
      recipientEmail = inviter?.email || "";
      if (!recipientEmail) {
        return new Response(JSON.stringify({ error: "no inviter email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      subject = `Alojamiento confirmado – ${event?.title || "Viaje"}`;
      idempotencyKey = `roommate-accepted-${rm.id}`;
      label = "roommate_accepted";
      const companero = rm.nombre || rm.email || "tu compañero";
      const body = `
        <p style="font-size:15px;line-height:1.55;">¡Buenas noticias!</p>
        <p style="font-size:15px;line-height:1.55;">
          <strong>${esc(companero)}</strong> aceptó compartir habitación con vos en <strong>${esc(event?.title || "el viaje")}</strong>.
        </p>
        <div style="border:1px solid #eee;border-radius:10px;padding:16px 18px;margin:16px 0;background:#fafafa;">
          <p style="margin:0 0 6px;font-size:13px;color:#888;">Paquete</p>
          <p style="margin:0 0 10px;font-weight:600;">${esc(paquete)}</p>
          <p style="margin:0 0 6px;font-size:13px;color:#888;">Compañero/a confirmado</p>
          <p style="margin:0;font-weight:600;">${esc(companero)}</p>
        </div>
        <p style="font-size:14px;color:#444;line-height:1.55;">
          El equipo de Reybaud los ubicará en la misma habitación. Podés seguir gestionando compañeros desde tu Hub del viaje.
        </p>`;
      html = shell("Alojamiento confirmado", event?.title || "", body, "Ver mi viaje", eventLink);
      text = `${companero} aceptó compartir habitación con vos en ${event?.title || "el viaje"}. Ver: ${eventLink}`;
    }

    // Idempotency check
    const { data: dup } = await supabase.from("reservation_notifications").select("id").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (dup) {
      return new Response(JSON.stringify({ success: true, duplicate: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const unsubscribeToken = await getOrCreateUnsubscribeToken(supabase, recipientEmail);
    const messageId = crypto.randomUUID();
    const payload = {
      message_id: messageId,
      to: recipientEmail,
      from: `${FROM_NAME} <reservas@${SENDER_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: "transactional",
      label,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    };

    const { error: enqErr } = await supabase.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload,
    });

    await supabase.from("reservation_notifications").insert({
      reservation_id: rm.reservation_id,
      alumno_id: reservation.alumno_id,
      tipo: kind === "invite" ? "roommate_invite" : "roommate_accepted",
      canal: "email",
      asunto: subject,
      contenido: text,
      metadata: { kind, roommate_id: rm.id, email_sent: !enqErr, email_error: enqErr?.message || null },
      idempotency_key: idempotencyKey,
    });

    return new Response(JSON.stringify({ success: true, email_sent: !enqErr, error: enqErr?.message || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-roommate-notification error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
