// Sends "reservation confirmed — pay seña" email with MP and cash CTAs.
// Idempotent at DB level via event_reservations.confirmation_payment_email_sent_at.
// Invoked by the cron worker (process-admin-notifications) or directly by admin.

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

async function getUnsubToken(sb: any, email: string) {
  const n = normalizeEmail(email);
  const { data: ex } = await sb.from("email_unsubscribe_tokens").select("token").eq("email", n).maybeSingle();
  if (ex?.token) return ex.token;
  const t = crypto.randomUUID();
  await sb.from("email_unsubscribe_tokens").insert({ email: n, token: t });
  return t;
}

const fmtMoney = (n: number, c: string) => {
  const cur = (c || "ARS").toUpperCase();
  const sym = cur === "USD" ? "USD " : cur === "EUR" ? "EUR " : "$";
  return `${sym}${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { reservation_id, force = false } = await req.json();
    if (!reservation_id) {
      return new Response(JSON.stringify({ error: "Missing reservation_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: r } = await sb
      .from("event_reservations")
      .select("id, alumno_id, external_participant_id, event_id, amount_total, balance_due, currency_snapshot, moneda, confirmation_payment_email_sent_at, confirmation_payment_email_attempts")
      .eq("id", reservation_id)
      .single();
    if (!r) return new Response(JSON.stringify({ error: "Reservation not found" }), { status: 404, headers: corsHeaders });

    if (!force && r.confirmation_payment_email_sent_at) {
      return new Response(JSON.stringify({ ok: true, skipped: "already_sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recipient
    let email = "", nombre = "";
    if (r.alumno_id) {
      const { data: a } = await sb.from("alumnos").select("email, nombre, apellido").eq("id", r.alumno_id).single();
      if (a?.email) { email = a.email; nombre = `${a.nombre} ${a.apellido || ""}`.trim(); }
    }
    if (!email && r.external_participant_id) {
      const { data: ep } = await sb.from("event_external_participants").select("email, nombre, apellido").eq("id", r.external_participant_id).single();
      if (ep?.email) { email = ep.email; nombre = `${ep.nombre} ${ep.apellido || ""}`.trim(); }
    }
    if (!email) {
      await sb.from("event_reservations").update({
        confirmation_payment_email_failed_at: new Date().toISOString(),
        confirmation_payment_email_attempts: (r.confirmation_payment_email_attempts || 0) + 1,
        confirmation_payment_email_last_error: "no_recipient_email",
      }).eq("id", reservation_id);
      return new Response(JSON.stringify({ error: "No recipient email" }), { status: 400, headers: corsHeaders });
    }

    // Event
    const { data: ev } = await sb.from("events").select("title, currency, type, fecha_inicio, lugar").eq("id", r.event_id).single();

    // Importe a pagar ahora
    const { data: calc } = await sb.rpc("importe_a_pagar_ahora", { _reservation_id: reservation_id });
    const amount = Number(calc?.amount || 0);
    const currency = calc?.currency || r.currency_snapshot || r.moneda || "ARS";
    const concepto = calc?.concepto || "saldo";

    // Plan de cuotas materializado para esta reserva (si tiene)
    const { data: installments } = await sb
      .from("reservation_installments")
      .select("installment_number, label, amount, currency, due_date, balance_due, status")
      .eq("reservation_id", reservation_id)
      .order("sort_order", { ascending: true });

    const fmtDate = (d?: string | null) => {
      if (!d) return "";
      const [y, m, dd] = d.split("-");
      return `${dd}/${m}/${y}`;
    };

    let installmentsTableHtml = "";
    let installmentsTableText = "";
    if (installments && installments.length > 0) {
      const rows = installments.map((i: any) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#111">
            ${i.label || `Cuota ${i.installment_number}`}
            ${i.due_date ? `<div style="font-size:11px;color:#6b7280">Vence ${fmtDate(i.due_date)}</div>` : ""}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#111;text-align:right;font-weight:600">
            ${fmtMoney(Number(i.amount || 0), i.currency || currency)}
          </td>
        </tr>`).join("");
      installmentsTableHtml = `
  <div style="margin:20px 0 8px">
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#111">Plan de pagos completo</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">Concepto</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">Monto</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:6px 0 0;font-size:11px;color:#6b7280">Los montos y fechas pueden ajustarse si cambian el paquete o el precio.</p>
  </div>`;
      installmentsTableText = "\n\nPlan de pagos:\n" + installments.map((i: any) =>
        `- ${i.label || `Cuota ${i.installment_number}`}${i.due_date ? ` (vence ${fmtDate(i.due_date)})` : ""}: ${fmtMoney(Number(i.amount || 0), i.currency || currency)}`
      ).join("\n");
    }

    const payUrl = `${APP_DOMAIN}/mis-reservas/${reservation_id}?action=pay`;
    const cashUrl = `${APP_DOMAIN}/mis-reservas/${reservation_id}?action=cash`;
    const viewUrl = `${APP_DOMAIN}/mis-reservas/${reservation_id}`;

    const unsubToken = await getUnsubToken(sb, email);
    const unsubUrl = `${APP_DOMAIN}/email/unsubscribe?token=${unsubToken}`;


    const subject = `Tu reserva fue confirmada — coordinemos la seña`;
    const html = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:620px;margin:0 auto;background:#fff;color:#111;padding:24px">
  <h1 style="font-size:22px;margin:0 0 8px;color:#0a0a0a">¡Tu reserva está confirmada!</h1>
  <p style="margin:0 0 16px;color:#444">Hola <strong>${nombre || "ciclista"}</strong>, ya quedaste anotado en <strong>${ev?.title || "el evento"}</strong>.</p>

  <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:16px 0">
    <p style="margin:0;color:#6b7280;font-size:12px">Próximo pago sugerido</p>
    <p style="margin:4px 0 0;font-size:24px;font-weight:700;color:#ea580c">${fmtMoney(amount, currency)}</p>
    <p style="margin:8px 0 0;color:#6b7280;font-size:12px">${concepto === "saldo" ? "Saldo total" : concepto.replace("_", " ").replace("seña", "Seña")}</p>
  </div>

  <p style="margin:16px 0 12px;color:#111">¿Cómo querés pagarlo?</p>
  <table style="width:100%;border-collapse:separate;border-spacing:0 8px">
    <tr><td>
      <a href="${payUrl}" style="display:block;background:#22c55e;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:600">
        Pagar ahora con Mercado Pago
      </a>
    </td></tr>
    <tr><td>
      <a href="${cashUrl}" style="display:block;background:#fff;color:#111;border:2px solid #f59e0b;text-decoration:none;text-align:center;padding:12px;border-radius:10px;font-weight:600">
        Voy a pagar en efectivo
      </a>
    </td></tr>
    <tr><td>
      <a href="${viewUrl}" style="display:block;color:#0369a1;text-decoration:none;text-align:center;padding:8px;font-size:13px">
        Ver mi reserva
      </a>
    </td></tr>
  </table>

  ${installmentsTableHtml}

  <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:10px 12px;border-radius:6px;margin:20px 0;font-size:13px;color:#92400e">
    <strong>Efectivo:</strong> el botón solo nos avisa que pensás pagar así. No acredita el pago hasta que lo cobramos.
  </div>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="font-size:11px;color:#9ca3af;margin:0">Reybaud Ciclismo · <a href="${unsubUrl}" style="color:#9ca3af">Cancelar suscripción</a></p>
</div>`;

    const text = `Tu reserva fue confirmada. Próximo pago sugerido: ${fmtMoney(amount, currency)}.\n\nPagar ahora: ${payUrl}\nAvisar efectivo: ${cashUrl}\nVer reserva: ${viewUrl}${installmentsTableText}`;


    const messageId = force
      ? `confirm-pay-${reservation_id}-${Date.now()}`
      : `confirm-pay-${reservation_id}`;
    const { error: enqErr } = await sb.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: email,
        from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: "transactional",
        label: "reservation_confirmed_with_payment",
        idempotency_key: messageId,
        unsubscribe_token: unsubToken,
        queued_at: new Date().toISOString(),
      },
    });

    if (enqErr) {
      await sb.from("event_reservations").update({
        confirmation_payment_email_failed_at: new Date().toISOString(),
        confirmation_payment_email_attempts: (r.confirmation_payment_email_attempts || 0) + 1,
        confirmation_payment_email_last_error: enqErr.message,
      }).eq("id", reservation_id);
      await sb.from("audit_log").insert({
        action: "reserva.confirmation_email.fallido",
        entity_type: "event_reservation", entity_id: reservation_id,
        user_role: "edge_function",
        details: { error: enqErr.message },
      });
      return new Response(JSON.stringify({ ok: false, error: enqErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sb.from("event_reservations").update({
      confirmation_payment_email_sent_at: new Date().toISOString(),
      confirmation_payment_email_attempts: (r.confirmation_payment_email_attempts || 0) + 1,
    }).eq("id", reservation_id);

    await sb.from("audit_log").insert({
      action: "reserva.confirmation_email.enviado",
      entity_type: "event_reservation", entity_id: reservation_id,
      user_role: "edge_function",
      details: { recipient: email, amount, currency, concepto },
    });

    return new Response(JSON.stringify({ ok: true, recipient: email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-reservation-confirmed-with-payment error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
