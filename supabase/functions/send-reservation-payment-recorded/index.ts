// Sends the unified "Pago registrado" email for an event reservation payment.
// Used by:
//   - mp-webhook (after an MP payment is approved for an event reservation)
//   - admin manual payment registration (AdminEventReservations.tsx)
//   - any future cash/transfer/external flow that records a reservation payment
//
// It rebuilds the same template the admin uses for "pago_registrado" so the email
// the alumno receives is identical regardless of how the payment was registered.
// Delegates the actual send + logging to `notify-reservation` (single source of truth
// for email queueing and reservation_notifications logging).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Payload {
  reservation_id: string;
  amount?: number;                 // amount of this specific payment (for the email body)
  payment_method?: string;         // 'mercadopago' | 'efectivo' | 'transferencia' | ...
  payment_reference?: string;      // for idempotency key
  installment_number?: number | null;
  enviado_por?: string | null;
  enviado_por_email?: string | null;
}

const fmtMoney = (n: number, c: string) => {
  const cur = (c || "ARS").toUpperCase();
  const sym = cur === "USD" ? "USD " : cur === "EUR" ? "EUR " : "$ ";
  return `${sym}${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
};

const statusLabel: Record<string, string> = {
  pagada: "Pagada", pagado: "Pagada",
  parcial: "Parcial",
  pendiente: "Pendiente",
  vencida: "Vencida",
  condonada: "Condonada",
};
const statusColor: Record<string, string> = {
  pagada: "#059669", pagado: "#059669",
  parcial: "#2563eb",
  pendiente: "#6b7280",
  vencida: "#dc2626",
  condonada: "#9ca3af",
};

function buildPlan(insts: any[] | null, currency: string) {
  if (!insts || insts.length === 0) return { text: "", html: "" };
  const lines = insts.map((i: any) => {
    const label = i.label || `Cuota ${i.installment_number || ""}`.trim();
    const amount = fmtMoney(Number(i.amount || 0), currency);
    const venc = fmtDate(i.due_date);
    const est = statusLabel[i.status] || i.status || "Pendiente";
    const saldo = i.balance_due != null && Number(i.balance_due) > 0 && i.status !== "pagada" && i.status !== "pagado"
      ? ` — saldo ${fmtMoney(Number(i.balance_due), currency)}`
      : "";
    return `• ${label}: ${amount} — vence ${venc} — ${est}${saldo}`;
  });
  const text = `\n\nPlan de pagos:\n${lines.join("\n")}`;
  const rows = insts.map((i: any) => {
    const label = i.label || `Cuota ${i.installment_number || ""}`.trim();
    const amount = fmtMoney(Number(i.amount || 0), currency);
    const venc = fmtDate(i.due_date);
    const est = statusLabel[i.status] || i.status || "Pendiente";
    const color = statusColor[i.status] || "#6b7280";
    const saldoCell = i.balance_due != null && Number(i.balance_due) > 0 && i.status !== "pagada" && i.status !== "pagado"
      ? fmtMoney(Number(i.balance_due), currency)
      : "—";
    return `<tr><td style="padding:6px 8px;border:1px solid #e5e7eb">${label}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right">${amount}</td><td style="padding:6px 8px;border:1px solid #e5e7eb">${venc}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;color:${color};font-weight:bold">${est}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right">${saldoCell}</td></tr>`;
  }).join("");
  const html = `<h3 style="color:#1a1a2e;margin:18px 0 8px;font-size:15px">Plan de pagos</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f9fafb"><th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Cuota</th><th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right">Monto</th><th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Vence</th><th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Estado</th><th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right">Saldo</th></tr></thead><tbody>${rows}</tbody></table>`;
  return { text, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload: Payload = await req.json();
    if (!payload.reservation_id) {
      return new Response(JSON.stringify({ error: "Missing reservation_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load reservation
    const { data: r } = await sb
      .from("event_reservations")
      .select("id, alumno_id, external_participant_id, event_id, amount_paid, balance_due, amount_total, currency_snapshot, moneda")
      .eq("id", payload.reservation_id)
      .maybeSingle();

    if (!r) {
      return new Response(JSON.stringify({ error: "Reservation not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recipient name (also resolved by notify-reservation, but we need it for the body)
    let nombre = "ciclista";
    if (r.alumno_id) {
      const { data: a } = await sb.from("alumnos").select("nombre, apellido").eq("id", r.alumno_id).maybeSingle();
      if (a) nombre = `${a.nombre || ""} ${a.apellido || ""}`.trim() || nombre;
    } else if (r.external_participant_id) {
      const { data: ep } = await sb.from("event_external_participants").select("nombre, apellido").eq("id", r.external_participant_id).maybeSingle();
      if (ep) nombre = `${ep.nombre || ""} ${ep.apellido || ""}`.trim() || nombre;
    }

    // Event
    const { data: ev } = await sb.from("events").select("title").eq("id", r.event_id).maybeSingle();
    const eventTitle = ev?.title || "el evento";

    const currency = r.currency_snapshot || r.moneda || "ARS";
    const paidAmount = Number(payload.amount ?? r.amount_paid ?? 0);
    const totalPaid = Number(r.amount_paid || 0);
    const balance = Number(r.balance_due || 0);

    // Installments plan
    const { data: insts } = await sb
      .from("reservation_installments")
      .select("installment_number, label, amount, due_date, balance_due, status, sort_order")
      .eq("reservation_id", r.id)
      .order("sort_order", { ascending: true });

    const plan = buildPlan(insts as any[] | null, currency);

    const ctx = {
      nombre,
      evento: eventTitle,
      monto: fmtMoney(paidAmount, currency),
      abonado: fmtMoney(totalPaid, currency),
      saldo: fmtMoney(balance, currency),
      plan_text: plan.text,
      plan_html: plan.html,
    };

    const asunto = `Tu pago fue registrado — ${eventTitle}`;
    const contenido = `Hola ${ctx.nombre},\n\nTe confirmamos que registramos tu pago de ${ctx.monto} para ${ctx.evento}.\n\nAbonado hasta ahora: ${ctx.abonado}\nSaldo pendiente: ${ctx.saldo}${ctx.plan_text}\n\n¡Gracias!`;
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><h2 style="color:#1a1a2e">Pago registrado</h2><p>Hola <strong>${ctx.nombre}</strong>,</p><p>Te confirmamos que registramos tu pago de <strong>${ctx.monto}</strong> para <strong>${ctx.evento}</strong>.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;border:1px solid #e5e7eb">Abonado</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;color:#059669">${ctx.abonado}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb">Saldo pendiente</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;color:#d97706">${ctx.saldo}</td></tr></table>${ctx.plan_html}<p>¡Gracias!</p><p style="color:#6b7280;font-size:12px">Reybaud Ciclismo</p></div>`;

    const idempotency_key = `pago-recorded-${r.id}-${payload.payment_reference || payload.payment_method || "manual"}-${payload.installment_number ?? "general"}`;

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/notify-reservation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        reservation_id: r.id,
        alumno_id: r.alumno_id,
        tipo: "pago_registrado",
        asunto,
        contenido_html: html,
        contenido_texto: contenido,
        enviado_por: payload.enviado_por || null,
        enviado_por_email: payload.enviado_por_email || "system",
        metadata: {
          monto: paidAmount,
          metodo: payload.payment_method || null,
          payment_reference: payload.payment_reference || null,
          installment_number: payload.installment_number ?? null,
          nuevo_abonado: totalPaid,
          nuevo_saldo: balance,
          source: payload.payment_method === "mercadopago" ? "mp_webhook" : "manual",
        },
        idempotency_key,
        canal: "email",
      }),
    });

    const body = await resp.json().catch(() => ({}));
    return new Response(JSON.stringify({ ok: resp.ok, downstream: body }), {
      status: resp.ok ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-reservation-payment-recorded error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
