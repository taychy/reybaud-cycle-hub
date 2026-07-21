// Sends the "pedido listo para retirar" notice to an alumno for a delivery list.
// Reads the template from public.email_templates (key: delivery-ready-pickup),
// enqueues via `enqueue_email`, marks all items of (list_id + cliente_nombre) as notified,
// and logs to student_activity_log.
//
// Extras:
// - Computes total / cobrado / saldo pendiente por moneda a partir de
//   delivery_list_items (precio_venta * cantidad) y delivery_list_payments (validados).
// - Soporta `test_email` para reenviar la misma pieza a otra dirección sin marcar el ítem.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Ciclismo Reybaud";
const REPLY_EMAIL = "natalia@ciclismoreybaud.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  list_id: string;
  cliente_nombre: string;
  alumno_id: string;
  channel?: "email" | "whatsapp"; // default email
  actor_id?: string | null;
  actor_email?: string | null;
  test_email?: string | null; // override recipient (no marca items)
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const formatVariant = (v: any): string => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    return Object.entries(v)
      .filter(([, val]) => val != null && val !== "")
      .map(([k, val]) => `${k}: ${val}`).join(" · ");
  }
  return String(v);
};

const CURRENCY_SYMBOL: Record<string, string> = { ARS: "$", USD: "US$", EUR: "€" };
const fmtMoney = (n: number, cur: string) => {
  const sym = CURRENCY_SYMBOL[cur] || "";
  return `${sym} ${Math.round(n * 100) / 100}`.trim();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Payload;
    const { list_id, cliente_nombre, alumno_id, actor_id, actor_email, test_email } = body;
    const channel = body.channel === "whatsapp" ? "whatsapp" : "email";
    if (!list_id || !cliente_nombre || !alumno_id) {
      return new Response(JSON.stringify({ error: "list_id, cliente_nombre y alumno_id son requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load list + items + payments + alumno + template
    const [{ data: list }, { data: items }, { data: payments }, { data: alumno }, { data: tpl }] = await Promise.all([
      supabase.from("delivery_lists").select("id, titulo").eq("id", list_id).maybeSingle(),
      supabase.from("delivery_list_items").select("id, producto, variante, cantidad, precio_venta, moneda").eq("list_id", list_id).eq("cliente_nombre", cliente_nombre),
      supabase.from("delivery_list_payments").select("monto, moneda, validado").eq("list_id", list_id).eq("cliente_nombre", cliente_nombre).eq("validado", true),
      supabase.from("alumnos").select("id, nombre, apellido, email, telefono").eq("id", alumno_id).maybeSingle(),
      supabase.from("email_templates").select("subject, html_body, text_body").eq("key", "delivery-ready-pickup").maybeSingle(),
    ]);

    if (!list) return new Response(JSON.stringify({ error: "Lista no encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!alumno) return new Response(JSON.stringify({ error: "Alumno no encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const recipientEmail = test_email || alumno.email;
    if (channel === "email" && !recipientEmail) return new Response(JSON.stringify({ error: "Sin email destino" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (channel === "whatsapp" && !(alumno as any).telefono) return new Response(JSON.stringify({ error: "Alumno sin teléfono" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!tpl) return new Response(JSON.stringify({ error: "Plantilla no encontrada" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const its = items || [];

    // Balances por moneda
    const totales: Record<string, number> = {};
    for (const i of its as any[]) {
      const cur = i.moneda || "ARS";
      const sub = Number(i.precio_venta || 0) * Number(i.cantidad || 1);
      totales[cur] = (totales[cur] || 0) + sub;
    }
    const cobrados: Record<string, number> = {};
    for (const p of (payments || []) as any[]) {
      const cur = p.moneda || "ARS";
      cobrados[cur] = (cobrados[cur] || 0) + Number(p.monto || 0);
    }
    const monedas = Array.from(new Set([...Object.keys(totales), ...Object.keys(cobrados)]));
    const hasAmounts = monedas.some((m) => (totales[m] || 0) > 0);

    // Detalle con precio unitario
    const detailLinesTxt = its.map((i: any) => {
      const q = (i.cantidad || 1) > 1 ? `${i.cantidad}× ` : "";
      const v = formatVariant(i.variante);
      const price = Number(i.precio_venta || 0) > 0
        ? ` — ${fmtMoney(Number(i.precio_venta) * Number(i.cantidad || 1), i.moneda || "ARS")}`
        : "";
      return `- ${q}${i.producto}${v ? ` (${v})` : ""}${price}`;
    });
    const detailLinesHtml = its.map((i: any) => {
      const q = (i.cantidad || 1) > 1 ? `<strong>${i.cantidad}×</strong> ` : "";
      const v = formatVariant(i.variante);
      const price = Number(i.precio_venta || 0) > 0
        ? ` <span style="color:#f59e0b">— ${escapeHtml(fmtMoney(Number(i.precio_venta) * Number(i.cantidad || 1), i.moneda || "ARS"))}</span>`
        : "";
      return `• ${q}${escapeHtml(i.producto)}${v ? ` <span style="color:#9ca3af">(${escapeHtml(v)})</span>` : ""}${price}`;
    }).join("<br/>");

    // Bloque de estado de pago
    let pagoEstadoHtml = "";
    let pagoEstadoTxt = "";
    if (hasAmounts) {
      const rows = monedas.map((m) => {
        const total = totales[m] || 0;
        const cob = cobrados[m] || 0;
        const saldo = Math.max(0, total - cob);
        return { m, total, cob, saldo };
      }).filter((r) => r.total > 0 || r.cob > 0);

      const anySaldo = rows.some((r) => r.saldo > 0.001);
      pagoEstadoHtml =
        `<div style="background:${anySaldo ? "#3b2f1a" : "#0f2a1a"};border:1px solid ${anySaldo ? "#f59e0b40" : "#10b98140"};border-radius:8px;padding:14px;margin:16px 0">` +
        `<div style="color:${anySaldo ? "#fbbf24" : "#34d399"};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">${anySaldo ? "Saldo pendiente" : "Pedido cancelado"}</div>` +
        rows.map((r) =>
          `<div style="color:#e5e7eb;font-size:14px;line-height:1.7">` +
          `<div>Total: <strong style="color:#ffffff">${escapeHtml(fmtMoney(r.total, r.m))}</strong></div>` +
          `<div>Cobrado: <strong style="color:#ffffff">${escapeHtml(fmtMoney(r.cob, r.m))}</strong></div>` +
          `<div>Pendiente: <strong style="color:${r.saldo > 0.001 ? "#fbbf24" : "#34d399"}">${escapeHtml(fmtMoney(r.saldo, r.m))}</strong></div>` +
          `</div>`
        ).join('<hr style="border:none;border-top:1px solid #ffffff10;margin:8px 0" />') +
        (anySaldo
          ? `<p style="margin:10px 0 0;color:#fde68a;font-size:12px">Podés coordinar el pago con nosotros escribiendo a <a href="mailto:${REPLY_EMAIL}" style="color:#fbbf24;text-decoration:underline">${REPLY_EMAIL}</a>.</p>`
          : "") +
        `</div>`;
      pagoEstadoTxt = rows.map((r) =>
        `Total: ${fmtMoney(r.total, r.m)} · Cobrado: ${fmtMoney(r.cob, r.m)} · Pendiente: ${fmtMoney(r.saldo, r.m)}`
      ).join("\n");
    } else {
      pagoEstadoHtml = `<div style="background:#3b2f1a;border:1px solid #f59e0b40;border-radius:8px;padding:12px;margin:16px 0"><p style="margin:0;color:#fde68a;font-size:13px">Coordiná el pago del pedido escribiendo a <a href="mailto:${REPLY_EMAIL}" style="color:#fbbf24;text-decoration:underline">${REPLY_EMAIL}</a>.</p></div>`;
      pagoEstadoTxt = `Coordiná el pago escribiendo a ${REPLY_EMAIL}.`;
    }

    const alumnoName = [alumno.nombre, alumno.apellido].filter(Boolean).join(" ").trim() || cliente_nombre;

    // WhatsApp CTA button (wa.me con mensaje pre-armado)
    const WA_PHONE = "5491153833337";
    const waMsg = `Hola! Escribo por mi pedido de ${list.titulo}. Quiero coordinar el retiro${(monedas.some((m) => (totales[m] || 0) - (cobrados[m] || 0) > 0.001)) ? " y el pago del saldo pendiente" : ""}.`;
    const waUrl = `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(waMsg)}`;
    const waButtonHtml = `<div style="text-align:center;margin:20px 0"><a href="${waUrl}" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px">💬 Escribinos por WhatsApp</a></div>`;
    pagoEstadoHtml = pagoEstadoHtml + waButtonHtml;
    pagoEstadoTxt = pagoEstadoTxt + `\n\nWhatsApp: ${waUrl}`;

    const vars: Record<string, string> = {
      alumno_nombre: escapeHtml(alumnoName),
      lista_titulo: escapeHtml(list.titulo),
      pedido_detalle_html: detailLinesHtml,
      pedido_detalle_txt: detailLinesTxt.join("\n"),
      pago_estado_html: pagoEstadoHtml,
      pago_estado_txt: pagoEstadoTxt,
      reply_email: REPLY_EMAIL,
      whatsapp_url: waUrl,
    };
    const replace = (s: string) => s.replace(/\{(\w+)\}/g, (_m, k) => vars[k] ?? `{${k}}`);

    const subject = replace(tpl.subject) + (test_email ? " [TEST]" : "");
    const html = replace(tpl.html_body);
    const text = tpl.text_body ? replace(tpl.text_body) : `${alumnoName}, tu pedido de ${list.titulo} está listo para retirar.\n\n${pagoEstadoTxt}`;

    const messageId = crypto.randomUUID();
    const idempotencyKey = `delivery-ready-${list_id}-${alumno_id}-${channel}-${test_email ? "test-" : ""}${Date.now()}`;

    if (channel === "email") {
      const { error: qErr } = await supabase.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: recipientEmail,
          from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text,
          purpose: "transactional",
          label: "delivery-ready-pickup",
          idempotency_key: idempotencyKey,
          queued_at: new Date().toISOString(),
        },
      });
      if (qErr) throw new Error(`queue_failed: ${qErr.message}`);
    }

    // No marcar como avisado ni loguear si es test
    if (!test_email) {
      const nowIso = new Date().toISOString();
      await supabase
        .from("delivery_list_items")
        .update({
          aviso_retiro_enviado_at: nowIso,
          aviso_retiro_channel: channel,
          aviso_retiro_enviado_por: actor_id ?? null,
          alumno_id,
        })
        .eq("list_id", list_id)
        .eq("cliente_nombre", cliente_nombre);

      const channelLabel = channel === "whatsapp" ? "WhatsApp" : "email";
      await supabase.from("student_activity_log").insert({
        alumno_id,
        event_type: channel === "whatsapp" ? "whatsapp_enviado" : "email_enviado",
        title: `Aviso de retiro enviado por ${channelLabel}`,
        description: `Se le avisó por ${channelLabel} que su pedido de "${list.titulo}" está listo para retirar en la camioneta de la escuela.`,
        actor_id: actor_id ?? null,
        actor_email: actor_email ?? null,
        actor_role: "admin",
        reference_type: "delivery_list",
        reference_id: list_id,
        reference_label: list.titulo,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        channel,
        sent_to: channel === "email" ? recipientEmail : (alumno as any).telefono || null,
        test: !!test_email,
        balances: monedas.map((m) => ({ moneda: m, total: totales[m] || 0, cobrado: cobrados[m] || 0, pendiente: Math.max(0, (totales[m] || 0) - (cobrados[m] || 0)) })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-delivery-ready-pickup error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
