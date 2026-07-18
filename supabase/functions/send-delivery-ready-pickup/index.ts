// Sends the "pedido listo para retirar" notice to an alumno for a delivery list.
// Reads the template from public.email_templates (key: delivery-ready-pickup),
// enqueues via `enqueue_email`, marks all items of (list_id + cliente_nombre) as notified,
// and logs to student_activity_log.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Payload;
    const { list_id, cliente_nombre, alumno_id, actor_id, actor_email } = body;
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

    // Load list + items + alumno + template in parallel
    const [{ data: list }, { data: items }, { data: alumno }, { data: tpl }] = await Promise.all([
      supabase.from("delivery_lists").select("id, titulo").eq("id", list_id).maybeSingle(),
      supabase.from("delivery_list_items").select("id, producto, variante, cantidad").eq("list_id", list_id).eq("cliente_nombre", cliente_nombre),
      supabase.from("alumnos").select("id, nombre, apellido, email, telefono").eq("id", alumno_id).maybeSingle(),
      supabase.from("email_templates").select("subject, html_body, text_body").eq("key", "delivery-ready-pickup").maybeSingle(),
    ]);

    if (!list) return new Response(JSON.stringify({ error: "Lista no encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!alumno) return new Response(JSON.stringify({ error: "Alumno no encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (channel === "email" && !alumno.email) return new Response(JSON.stringify({ error: "Alumno sin email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (channel === "whatsapp" && !(alumno as any).telefono) return new Response(JSON.stringify({ error: "Alumno sin teléfono" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!tpl) return new Response(JSON.stringify({ error: "Plantilla no encontrada" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const its = items || [];
    const detailLinesTxt = its.map((i: any) => {
      const q = (i.cantidad || 1) > 1 ? `${i.cantidad}× ` : "";
      const v = formatVariant(i.variante);
      return `- ${q}${i.producto}${v ? ` (${v})` : ""}`;
    });
    const detailLinesHtml = its.map((i: any) => {
      const q = (i.cantidad || 1) > 1 ? `<strong>${i.cantidad}×</strong> ` : "";
      const v = formatVariant(i.variante);
      return `• ${q}${escapeHtml(i.producto)}${v ? ` <span style="color:#9ca3af">(${escapeHtml(v)})</span>` : ""}`;
    }).join("<br/>");

    const alumnoName = [alumno.nombre, alumno.apellido].filter(Boolean).join(" ").trim() || cliente_nombre;
    const vars: Record<string, string> = {
      alumno_nombre: escapeHtml(alumnoName),
      lista_titulo: escapeHtml(list.titulo),
      pedido_detalle_html: detailLinesHtml,
      pedido_detalle_txt: detailLinesTxt.join("\n"),
      reply_email: REPLY_EMAIL,
    };
    const replace = (s: string) => s.replace(/\{(\w+)\}/g, (_m, k) => vars[k] ?? `{${k}}`);

    const subject = replace(tpl.subject);
    const html = replace(tpl.html_body);
    const text = tpl.text_body ? replace(tpl.text_body) : `${alumnoName}, tu pedido de ${list.titulo} está listo para retirar.`;

    const messageId = crypto.randomUUID();
    const idempotencyKey = `delivery-ready-${list_id}-${alumno_id}-${channel}-${Date.now()}`;

    if (channel === "email") {
      const { error: qErr } = await supabase.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: alumno.email,
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

    // Mark items as notified
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

    return new Response(
      JSON.stringify({ ok: true, channel, sent_to: channel === "email" ? alumno.email : (alumno as any).telefono || null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-delivery-ready-pickup error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
