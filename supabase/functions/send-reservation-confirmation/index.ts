// Edge function: envía email de confirmación de reserva con resumen del paquete
// contratado + reglamento completo + políticas del evento.
//
// Se invoca desde el cliente justo después de crear la reserva.
// Usa el queue email (enqueue_email) y registra en reservation_notifications.

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

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const getOrCreateUnsubscribeToken = async (supabase: any, email: string) => {
  const normalized = normalizeEmail(email);
  const { data: existing } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  if (existing?.token) return existing.token;
  const newToken = crypto.randomUUID();
  const { data: inserted } = await supabase
    .from("email_unsubscribe_tokens")
    .insert({ email: normalized, token: newToken })
    .select("token")
    .single();
  if (inserted?.token) return inserted.token;
  const { data: fallback } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  return fallback?.token || newToken;
};

const fmtCurrency = (amount: number | null | undefined, currency: string | null | undefined) => {
  const n = Number(amount || 0);
  const cur = (currency || "ARS").toUpperCase();
  const symbol = cur === "USD" ? "USD " : cur === "EUR" ? "EUR " : "$";
  return `${symbol}${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
};

const escapeHtml = (s: string) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const textBlock = (text: string) =>
  `<div style="font-size:14px;color:#444;line-height:1.55;white-space:pre-line;">${escapeHtml(text)}</div>`;

const sectionCard = (title: string, body: string) => `
  <div style="border:1px solid #eee;border-radius:10px;padding:16px 18px;margin:12px 0;background:#fafafa;">
    <h3 style="margin:0 0 8px;font-size:14px;font-weight:700;color:#121212;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(title)}</h3>
    ${body}
  </div>
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { reservation_id } = await req.json();
    if (!reservation_id) {
      return new Response(JSON.stringify({ error: "Missing reservation_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Idempotency: si ya mandamos confirmación para esta reserva, no duplicamos.
    const idempotencyKey = `reservation-confirm-${reservation_id}`;
    const { data: existingNotif } = await supabase
      .from("reservation_notifications")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingNotif) {
      return new Response(JSON.stringify({ success: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch reservation + event + alumno + package + installments
    const { data: reservation, error: rErr } = await supabase
      .from("event_reservations")
      .select("*")
      .eq("id", reservation_id)
      .maybeSingle();
    if (rErr || !reservation) {
      return new Response(JSON.stringify({ error: "Reservation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: event } = await supabase
      .from("events")
      .select("id, title, date, end_date, location, type, metadata")
      .eq("id", reservation.event_id)
      .maybeSingle();

    let recipientEmail = "";
    let recipientName = "";
    if (reservation.alumno_id) {
      const { data: alumno } = await supabase
        .from("alumnos")
        .select("email, nombre, apellido")
        .eq("id", reservation.alumno_id)
        .maybeSingle();
      if (alumno?.email) {
        recipientEmail = alumno.email;
        recipientName = `${alumno.nombre} ${alumno.apellido || ""}`.trim();
      }
    }
    if (!recipientEmail && (reservation as any).external_participant_id) {
      const { data: ext } = await supabase
        .from("event_external_participants")
        .select("email, nombre, apellido")
        .eq("id", (reservation as any).external_participant_id)
        .maybeSingle();
      if (ext?.email) {
        recipientEmail = ext.email;
        recipientName = `${ext.nombre} ${ext.apellido || ""}`.trim();
      }
    }
    if (!recipientEmail || !event) {
      return new Response(JSON.stringify({ error: "Recipient or event missing" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cuotas (si las hay)
    const { data: installments } = await supabase
      .from("reservation_installments")
      .select("numero, monto, moneda, fecha_vencimiento, estado")
      .eq("reservation_id", reservation_id)
      .order("numero", { ascending: true });

    const meta: any = event.metadata || {};
    const packageNombre = (reservation as any).package_nombre_snapshot || null;
    const total = (reservation as any).amount_total ?? (reservation as any).price_snapshot ?? 0;
    const paid = (reservation as any).amount_paid ?? 0;
    const balance = (reservation as any).balance_due ?? Math.max(0, total - paid);
    const currency = (reservation as any).currency_snapshot || (reservation as any).moneda || "ARS";

    const eventLink = `${APP_DOMAIN}/eventos/${event.id}`;

    // ─── Resumen del paquete ───
    const resumenRows: string[] = [];
    resumenRows.push(`<tr><td style="padding:6px 0;color:#888;">Evento</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#121212;">${escapeHtml(event.title)}</td></tr>`);
    resumenRows.push(`<tr><td style="padding:6px 0;color:#888;">Fecha</td><td style="padding:6px 0;text-align:right;color:#121212;">${escapeHtml(fmtDate(event.date))}${event.end_date ? " – " + escapeHtml(fmtDate(event.end_date)) : ""}</td></tr>`);
    if (event.location) resumenRows.push(`<tr><td style="padding:6px 0;color:#888;">Lugar</td><td style="padding:6px 0;text-align:right;color:#121212;">${escapeHtml(event.location)}</td></tr>`);
    if (packageNombre) resumenRows.push(`<tr><td style="padding:6px 0;color:#888;">Paquete</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#121212;">${escapeHtml(packageNombre)}</td></tr>`);
    resumenRows.push(`<tr><td style="padding:6px 0;color:#888;">Total</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#121212;">${escapeHtml(fmtCurrency(total, currency))}</td></tr>`);
    resumenRows.push(`<tr><td style="padding:6px 0;color:#888;">Pagado</td><td style="padding:6px 0;text-align:right;color:#10b981;">${escapeHtml(fmtCurrency(paid, currency))}</td></tr>`);
    resumenRows.push(`<tr><td style="padding:6px 0;color:#888;">Saldo pendiente</td><td style="padding:6px 0;text-align:right;font-weight:700;color:${balance > 0 ? "#E8832A" : "#10b981"};">${escapeHtml(fmtCurrency(balance, currency))}</td></tr>`);

    const resumenHtml = `
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tbody>${resumenRows.join("")}</tbody>
      </table>
    `;

    // ─── Cuotas ───
    let cuotasHtml = "";
    if (installments && installments.length > 0) {
      cuotasHtml = `
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
          <thead>
            <tr style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;">
              <th style="text-align:left;padding:6px 4px;font-weight:600;">Cuota</th>
              <th style="text-align:left;padding:6px 4px;font-weight:600;">Vence</th>
              <th style="text-align:right;padding:6px 4px;font-weight:600;">Monto</th>
              <th style="text-align:right;padding:6px 4px;font-weight:600;">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${installments.map((c: any) => `
              <tr style="border-top:1px solid #eee;">
                <td style="padding:8px 4px;color:#121212;">${c.numero}</td>
                <td style="padding:8px 4px;color:#444;">${escapeHtml(fmtDate(c.fecha_vencimiento))}</td>
                <td style="padding:8px 4px;text-align:right;color:#121212;font-weight:600;">${escapeHtml(fmtCurrency(c.monto, c.moneda || currency))}</td>
                <td style="padding:8px 4px;text-align:right;color:${c.estado === "pagada" ? "#10b981" : "#888"};text-transform:capitalize;">${escapeHtml(c.estado || "pendiente")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }

    // ─── Reglamento ───
    const policySections: string[] = [];
    if (meta.politica_sena) policySections.push(sectionCard("Política de seña", textBlock(meta.politica_sena)));
    if (meta.politica_cancelacion) policySections.push(sectionCard("Política de cancelación", textBlock(meta.politica_cancelacion)));
    if (meta.politica_pagos) policySections.push(sectionCard("Política de pagos", textBlock(meta.politica_pagos)));
    if (meta.reglamento_texto) policySections.push(sectionCard("Reglamento del evento", textBlock(meta.reglamento_texto)));
    const reglamentoUrl = meta.reglamento || meta.reglamento_url;

    const subject = `Confirmación de tu reserva – ${event.title}`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#121212;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="font-size:22px;margin:0;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#121212;">
        Reserva confirmada
      </h1>
      <p style="font-size:13px;color:#888;margin:8px 0 0;">${escapeHtml(event.title)}</p>
    </div>

    <p style="font-size:15px;line-height:1.55;">
      Hola <strong>${escapeHtml(recipientName.split(" ")[0] || recipientName)}</strong>, tu reserva quedó registrada. Te dejamos el resumen del paquete contratado y el reglamento completo del evento.
    </p>

    ${sectionCard("Resumen de tu reserva", resumenHtml + cuotasHtml)}

    ${policySections.join("")}

    ${reglamentoUrl ? `
      <div style="text-align:center;margin:20px 0;">
        <a href="${escapeHtml(reglamentoUrl)}" style="display:inline-block;padding:10px 24px;border:1px solid #E8832A;border-radius:8px;color:#E8832A;text-decoration:none;font-size:13px;font-weight:600;">
          Descargar reglamento (PDF)
        </a>
      </div>
    ` : ""}

    <div style="text-align:center;margin:28px 0 12px;">
      <a href="${eventLink}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#E8832A,#F0A05C);color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
        Ver mi reserva
      </a>
    </div>

    <p style="font-size:11px;color:#999;text-align:center;margin-top:24px;line-height:1.5;">
      Al confirmar tu reserva aceptaste el reglamento y las políticas detalladas arriba.<br>
      Ciclismo Reybaud · ${escapeHtml(new Date().getFullYear().toString())}
    </p>
  </div>
</body>
</html>
    `.trim();

    const text = [
      `Hola ${recipientName.split(" ")[0] || recipientName},`,
      ``,
      `Tu reserva para ${event.title} quedó registrada.`,
      `Fecha: ${fmtDate(event.date)}${event.end_date ? " – " + fmtDate(event.end_date) : ""}`,
      packageNombre ? `Paquete: ${packageNombre}` : null,
      `Total: ${fmtCurrency(total, currency)} · Pagado: ${fmtCurrency(paid, currency)} · Saldo: ${fmtCurrency(balance, currency)}`,
      ``,
      `Ver tu reserva: ${eventLink}`,
      reglamentoUrl ? `Reglamento (PDF): ${reglamentoUrl}` : null,
    ].filter(Boolean).join("\n");

    // Enqueue email
    const messageId = crypto.randomUUID();
    const unsubscribeToken = await getOrCreateUnsubscribeToken(supabase, recipientEmail);
    const emailPayload = {
      message_id: messageId,
      to: recipientEmail,
      from: `${FROM_NAME} <reservas@${SENDER_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: "transactional",
      label: "reservation_confirmation",
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    };

    const { error: enqueueErr } = await supabase.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: emailPayload,
    });

    const emailSent = !enqueueErr;

    // Log a reservation_notifications
    await supabase.from("reservation_notifications").insert({
      reservation_id,
      alumno_id: reservation.alumno_id || null,
      tipo: "pago_registrado",
      canal: "email",
      asunto: subject,
      contenido: text,
      enviado_por: null,
      enviado_por_email: null,
      metadata: {
        kind: "reservation_confirmation",
        email_sent: emailSent,
        email_error: enqueueErr?.message || null,
        terminos_version: (reservation as any).terminos_version_aceptada || null,
      },
      idempotency_key: idempotencyKey,
    });

    return new Response(JSON.stringify({ success: true, email_sent: emailSent, error: enqueueErr?.message || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-reservation-confirmation error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
