// Generates an HTML report of a completed process instance and emails it
// to the destinatario_reporte_email saved on the instance.
// Photos are referenced as signed URLs (process-photos bucket is private).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { instance_id } = await req.json();
    if (!instance_id) throw new Error("instance_id requerido");

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: instance } = await sb.from("process_instances").select("*").eq("id", instance_id).single();
    if (!instance) throw new Error("Instancia no encontrada");
    const { data: template } = await sb.from("process_templates").select("*").eq("id", instance.template_id).single();
    const { data: tplStages } = await sb.from("process_template_stages").select("*").eq("template_id", instance.template_id).order("orden");
    const { data: instStages } = await sb.from("process_instance_stages").select("*").eq("instance_id", instance_id).order("orden");

    // Iniciado por
    let iniciadoNombre = instance.iniciado_por;
    const { data: profile } = await sb.from("deposito_profiles").select("first_name, last_name, email").eq("user_id", instance.iniciado_por).maybeSingle();
    if (profile) iniciadoNombre = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || profile.email || iniciadoNombre;

    // Signed URLs for photos (foto_url may be a single path or a JSON array of paths)
    const stagesHtml: string[] = [];
    for (const s of instStages || []) {
      const t = (tplStages || []).find((x: any) => x.id === s.template_stage_id);
      let fotoHtml = "";
      if (s.foto_url) {
        let paths: string[] = [];
        try {
          const parsed = JSON.parse(s.foto_url);
          paths = Array.isArray(parsed) ? parsed : [s.foto_url];
        } catch {
          paths = [s.foto_url];
        }
        const imgs: string[] = [];
        for (const p of paths) {
          const { data: signed } = await sb.storage.from("process-photos").createSignedUrl(p, 60 * 60 * 24 * 7);
          if (signed?.signedUrl) {
            imgs.push(`<a href="${signed.signedUrl}" target="_blank" style="display:inline-block;margin:4px"><img src="${signed.signedUrl}" alt="foto" style="max-width:280px;border-radius:6px;border:1px solid #ddd"/></a>`);
          }
        }
        if (imgs.length) fotoHtml = `<div style="margin-top:8px">${imgs.join("")}</div>`;
      }
      const notaHtml = s.nota
        ? `<pre style="white-space:pre-wrap;background:#f9fafb;padding:8px;border-radius:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;margin:6px 0">${escapeHtml(s.nota)}</pre>`
        : "";
      stagesHtml.push(`
        <div style="margin:16px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px">
          <h3 style="margin:0 0 4px;color:#111">Etapa ${s.orden}: ${escapeHtml(t?.titulo || "—")}</h3>
          ${t?.instrucciones ? `<p style="color:#666;font-size:12px;margin:4px 0">${escapeHtml(t.instrucciones)}</p>` : ""}
          ${notaHtml}
          ${s.entidad_ref_texto ? `<p><strong>Referencia:</strong> ${escapeHtml(s.entidad_ref_texto)}</p>` : ""}
          ${s.entidad_ref_id ? `<p><strong>Entidad ref:</strong> <code>${s.entidad_ref_id}</code></p>` : ""}
          ${fotoHtml}
          <p style="color:#888;font-size:11px;margin:4px 0 0">Completada: ${s.completed_at ? new Date(s.completed_at).toLocaleString("es-AR") : "—"}</p>
        </div>
      `);
    }

    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:680px;margin:auto;color:#111">
        <h1 style="margin:0 0 4px">Reporte de proceso: ${escapeHtml(template?.nombre || "")}</h1>
        <p style="color:#666;margin:0 0 16px">${escapeHtml(template?.descripcion || "")}</p>
        <div style="background:#f9fafb;padding:12px;border-radius:8px;font-size:13px">
          <p style="margin:2px 0"><strong>Iniciado por:</strong> ${escapeHtml(iniciadoNombre)}</p>
          <p style="margin:2px 0"><strong>Inicio:</strong> ${new Date(instance.started_at).toLocaleString("es-AR")}</p>
          <p style="margin:2px 0"><strong>Finalización:</strong> ${instance.completed_at ? new Date(instance.completed_at).toLocaleString("es-AR") : "—"}</p>
        </div>
        ${stagesHtml.join("")}
      </div>
    `;

    const to = instance.destinatario_reporte_email;
    if (!to) {
      return new Response(JSON.stringify({ ok: true, skipped: "no recipient" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SENDER_DOMAIN = "notify.reybaud-app.com";
    const FROM_NAME = "Reybaud Ciclismo";
    const subject = `Reporte de proceso: ${template?.nombre || ""}`;
    const messageId = crypto.randomUUID();

    // Encolar en la cola transactional_emails (cron process-email-queue se ocupa del envío real)
    const { error: qErr } = await sb.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to,
        from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text: `${subject}\nProceso completado.`,
        purpose: "transactional",
        label: "process_report",
        idempotency_key: `process-report-${instance_id}`,
        queued_at: new Date().toISOString(),
      },
    });

    if (qErr) {
      await sb.from("audit_log").insert({
        action: "process.report.enqueue_failed",
        entity_type: "process_instance",
        entity_id: instance_id,
        user_role: "edge_function",
        details: { to, error: qErr.message },
      });
      return new Response(JSON.stringify({ ok: false, error: qErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sb.from("audit_log").insert({
      action: "process.report.enqueued",
      entity_type: "process_instance",
      entity_id: instance_id,
      user_role: "edge_function",
      details: { to, message_id: messageId },
    });

    return new Response(JSON.stringify({ ok: true, to, message_id: messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
