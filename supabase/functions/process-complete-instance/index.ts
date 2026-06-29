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

const normalizeEmail = (e: string) => e.trim().toLowerCase();

const getOrCreateUnsubscribeToken = async (sb: any, email: string): Promise<string> => {
  const normalized = normalizeEmail(email);
  const { data: existing } = await sb
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  if (existing?.token) return existing.token;
  const token = crypto.randomUUID();
  const { data: inserted, error: insErr } = await sb
    .from("email_unsubscribe_tokens")
    .insert({ email: normalized, token })
    .select("token")
    .single();
  if (!insErr && inserted?.token) return inserted.token;
  const { data: fallback } = await sb
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  if (fallback?.token) return fallback.token;
  throw insErr ?? new Error("No se pudo crear unsubscribe token");
};

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

    // Detectar la etapa final (accion_final = send_report) y separar su nota como "comentario del gestor"
    const finalTpl = (tplStages || []).find((t: any) => t.accion_final === "send_report");
    const finalInstStage = finalTpl ? (instStages || []).find((s: any) => s.template_stage_id === finalTpl.id) : null;
    const comentarioGestor = finalInstStage?.nota || null;

    // KPI sniff a partir de las notas
    const allNotes = (instStages || []).map((s: any) => s.nota || "").join("\n");
    const grab = (re: RegExp) => {
      const m = allNotes.match(re);
      return m ? Number(m[1]) : null;
    };
    const kpis = {
      faltantes: grab(/faltant\w*[^0-9-]*(-?\d+)/i),
      excedentes: grab(/excedent\w*[^0-9-]*(-?\d+)/i),
      bajoStock: grab(/bajo\s*stock[^0-9-]*(-?\d+)/i),
    };

    const kpiCards: string[] = [];
    if (kpis.faltantes !== null) kpiCards.push(kpiBox("Faltantes", kpis.faltantes, "#dc2626", "#fee2e2"));
    if (kpis.excedentes !== null) kpiCards.push(kpiBox("Excedentes", kpis.excedentes, "#0891b2", "#cffafe"));
    if (kpis.bajoStock !== null) kpiCards.push(kpiBox("Bajo stock", kpis.bajoStock, "#d97706", "#fef3c7"));
    const kpiHtml = kpiCards.length
      ? `<div style="display:flex;gap:8px;margin:16px 0">${kpiCards.join("")}</div>`
      : "";

    // Signed URLs for photos (foto_url may be a single path or a JSON array of paths)
    const stagesHtml: string[] = [];
    for (const s of instStages || []) {
      // saltar la etapa final (su nota se muestra en bloque separado)
      if (finalTpl && s.template_stage_id === finalTpl.id) continue;
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
        : `<p style="color:#9ca3af;font-size:12px;margin:6px 0;font-style:italic">Sin observaciones</p>`;
      stagesHtml.push(`
        <div style="margin:16px 0;padding:14px;border:1px solid #e5e7eb;border-radius:8px;background:#ffffff">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <h3 style="margin:0;color:#111;font-size:15px">✓ Etapa ${s.orden}: ${escapeHtml(t?.titulo || "—")}</h3>
            <span style="color:#6b7280;font-size:11px">${s.completed_at ? new Date(s.completed_at).toLocaleString("es-AR") : "—"}</span>
          </div>
          ${t?.instrucciones ? `<p style="color:#6b7280;font-size:12px;margin:4px 0">${escapeHtml(t.instrucciones)}</p>` : ""}
          ${notaHtml}
          ${s.entidad_ref_texto ? `<p style="font-size:12px;margin:6px 0"><strong>Referencia:</strong> ${escapeHtml(s.entidad_ref_texto)}</p>` : ""}
          ${s.entidad_ref_id ? `<p style="font-size:12px;margin:6px 0"><strong>Entidad:</strong> <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px">${s.entidad_ref_id}</code></p>` : ""}
          ${fotoHtml}
        </div>
      `);
    }

    const comentarioHtml = comentarioGestor
      ? `<div style="margin:16px 0;padding:14px;border:2px solid #f97316;border-radius:8px;background:#fff7ed">
           <h3 style="margin:0 0 6px;color:#9a3412;font-size:14px">📝 Comentario final del gestor</h3>
           <pre style="white-space:pre-wrap;font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#1f2937;margin:0">${escapeHtml(comentarioGestor)}</pre>
         </div>`
      : "";

    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:680px;margin:auto;color:#111;background:#ffffff;padding:24px">
        <h1 style="margin:0 0 4px;font-size:22px">${escapeHtml(template?.nombre || "")}</h1>
        <p style="color:#6b7280;margin:0 0 16px;font-size:13px">${escapeHtml(template?.descripcion || "")}</p>
        <div style="background:#f9fafb;padding:12px;border-radius:8px;font-size:13px;border:1px solid #e5e7eb">
          <p style="margin:2px 0"><strong>Iniciado por:</strong> ${escapeHtml(iniciadoNombre)}</p>
          <p style="margin:2px 0"><strong>Inicio:</strong> ${new Date(instance.started_at).toLocaleString("es-AR")}</p>
          <p style="margin:2px 0"><strong>Finalización:</strong> ${instance.completed_at ? new Date(instance.completed_at).toLocaleString("es-AR") : "—"}</p>
        </div>
        ${kpiHtml}
        ${comentarioHtml}
        <h2 style="margin:24px 0 8px;font-size:16px;color:#111">Detalle de etapas</h2>
        ${stagesHtml.join("")}
        <p style="color:#9ca3af;font-size:11px;margin-top:24px;text-align:center">Reporte generado automáticamente · Reybaud Ciclismo</p>
      </div>
    `;

    const to = instance.destinatario_reporte_email;
    if (!to) {
      await sb.from("audit_log").insert({
        action: "process.report.skipped_no_recipient",
        entity_type: "process_instance",
        entity_id: instance_id,
        user_role: "edge_function",
        details: {},
      });
      return new Response(JSON.stringify({ ok: true, skipped: "no recipient" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SENDER_DOMAIN = "notify.reybaud-app.com";
    const FROM_NAME = "Reybaud Ciclismo";
    const subject = `Reporte: ${template?.nombre || "Proceso"} — ${new Date(instance.completed_at || Date.now()).toLocaleDateString("es-AR")}`;
    const messageId = crypto.randomUUID();
    const unsubscribeToken = await getOrCreateUnsubscribeToken(sb, to);

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
        text: `${subject}\nProceso completado. Abrí el mail para ver el reporte completo.`,
        purpose: "transactional",
        label: "process_report",
        idempotency_key: `process-report-${instance_id}`,
        unsubscribe_token: unsubscribeToken,
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
      details: { to, message_id: messageId, template: template?.nombre },
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

function kpiBox(label: string, value: number, color: string, bg: string) {
  return `<div style="flex:1;padding:10px;border-radius:8px;background:${bg};border:1px solid ${color}33;text-align:center">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280">${label}</div>
    <div style="font-size:22px;font-weight:700;color:${color};margin-top:2px">${value}</div>
  </div>`;
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
