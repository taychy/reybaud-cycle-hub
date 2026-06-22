// Send broadcast emails via Brevo connector gateway.
// Modes: "test" (single recipient) or "send" (all targeted recipients).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/brevo";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SegmentFilters {
  audience?: ("students" | "coaches")[];
  estados?: string[];          // ['activo','inactivo',...]
  sede_ids?: string[];
  grupos?: string[];           // 'Grupal' | 'Personalizado' | etc
  plan_ids?: string[];         // specific plan ids
  has_email_only?: boolean;    // default true
  alumno_ids?: string[];       // explicit override list
  coach_ids?: string[];        // explicit override list
}

interface SendBody {
  mode: "test" | "send" | "preview_count";
  test_email?: string;
  broadcast_id?: string;       // for "send"
  // preview_count + send_now use these directly
  subject?: string;
  content_html?: string;
  preheader?: string;
  segment_filters?: SegmentFilters;
  sender_email?: string;
  sender_name?: string;
  reply_to?: string;
  save_as?: "draft" | "sent";
  cta_url?: string;            // explicit CTA button URL
  cta_label?: string;          // explicit CTA button text
  excluded_emails?: string[];  // emails to skip in send
  include_full_list?: boolean; // preview_count returns full recipient list
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlWrap(content: string, preheader?: string, ctaOverride?: { url?: string; label?: string }) {
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>`
    : "";

  const looksHtml = /<\/?(p|div|br|a|h[1-6]|ul|ol|li|strong|em|span|table)\b/i.test(content);

  let bodyHtml = content;
  let ctaUrl: string | null = ctaOverride?.url?.trim() || null;
  let ctaLabel = ctaOverride?.label?.trim() || "Abrir en la app";

  if (!looksHtml) {
    // If no explicit CTA, auto-detect first URL in text
    if (!ctaUrl) {
      const match = content.match(/(https?:\/\/[^\s<]+)/i);
      if (match) {
        ctaUrl = match[1].replace(/[.,;:!?)]+$/, "");
        if (!ctaOverride?.label) {
          if (/reybaud-app\.com\/eventos\//i.test(ctaUrl)) ctaLabel = "Ver evento y reservar";
          else if (/reybaud-app\.com\/planes/i.test(ctaUrl)) ctaLabel = "Ver planes";
          else if (/reybaud-app\.com/i.test(ctaUrl)) ctaLabel = "Abrir en la app";
          else ctaLabel = "Abrir enlace";
        }
      }
    }

    // Strip the CTA url from body to avoid duplication
    let text = content;
    if (ctaUrl) text = text.split(ctaUrl).join("").trim();
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");

    bodyHtml = escapeHtml(text)
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p style="margin:0 0 18px;line-height:1.65;color:#e8e8e8;font-size:16px">${p.replace(/\n/g, "<br/>")}</p>`)
      .join("");
  }

  const ctaBlock = ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 6px">
        <tr><td style="border-radius:10px;background:#F08A2A">
          <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;letter-spacing:0.5px;color:#ffffff;text-decoration:none;font-weight:700">${ctaLabel}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;font-size:12px;color:#777"><a href="${ctaUrl}" style="color:#5BC8E0;word-break:break-all;text-decoration:underline">${ctaUrl}</a></p>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#121212;font-family:Inter,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e8e8e8">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#121212">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#1a1a1a;border-radius:14px;overflow:hidden;border:1px solid #262626">
      <tr><td style="padding:28px 32px 20px;text-align:left;border-bottom:1px solid #262626">
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:24px;letter-spacing:4px;color:#F08A2A;font-weight:800">REYBAUD</div>
      </td></tr>
      <tr><td style="padding:28px 32px 12px">${bodyHtml}${ctaBlock}</td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #262626;color:#666;font-size:11px;text-align:center;line-height:1.6">
        Recibís este email porque sos parte de Reybaud.<br/>
        Para dejar de recibir comunicaciones, respondé "BAJA" a este email.
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

async function loadRecipients(supabase: any, filters: SegmentFilters) {
  const explicitSelection = Boolean(filters.alumno_ids?.length || filters.coach_ids?.length);
  const audience = Array.isArray(filters.audience) ? filters.audience : ["students"];
  let rows: any[] = [];

  if ((filters.alumno_ids?.length || (!explicitSelection && audience.includes("students")))) {
    let q = supabase.from("alumnos").select("id, nombre, apellido, email, estado, sede_id, grupo");
    if (filters.alumno_ids?.length) {
      q = q.in("id", filters.alumno_ids);
    } else if (!explicitSelection) {
      if (filters.estados?.length) q = q.in("estado", filters.estados);
      if (filters.sede_ids?.length) q = q.in("sede_id", filters.sede_ids);
      if (filters.grupos?.length) q = q.in("grupo", filters.grupos);
    }
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []).map((a: any) => ({
      ...a,
      contact_type: "alumno",
      display_name: `${a.nombre ?? ""} ${a.apellido ?? ""}`.trim(),
    })));
  }

  if ((filters.coach_ids?.length || (!explicitSelection && audience.includes("coaches")))) {
    let q = supabase.from("coaches").select("id, nombre, email, estado, sede_id, grupos");
    if (filters.coach_ids?.length) {
      q = q.in("id", filters.coach_ids);
    } else if (!explicitSelection) {
      if (filters.estados?.length) q = q.in("estado", filters.estados);
      if (filters.sede_ids?.length) q = q.in("sede_id", filters.sede_ids);
      if (filters.grupos?.length) q = q.overlaps("grupos", filters.grupos);
    }
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []).map((c: any) => ({
      ...c,
      contact_type: "coach",
      display_name: c.nombre,
    })));
  }

  rows = rows.filter((a: any) => a.email && a.email.includes("@"));

  // exclude suppressed
  const emails = rows.map((r: any) => r.email.toLowerCase());
  if (emails.length) {
    const { data: sup } = await supabase
      .from("suppressed_emails")
      .select("email")
      .in("email", emails);
    const supSet = new Set((sup || []).map((s: any) => s.email.toLowerCase()));
    rows = rows.filter((r: any) => !supSet.has(r.email.toLowerCase()));
  }
  // de-dupe by email
  const seen = new Set<string>();
  return rows.filter((r: any) => {
    const k = r.email.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function sendOne(payload: any) {
  console.log("[brevo] POST /smtp/email", {
    from: payload?.sender,
    to: payload?.to,
    subject: payload?.subject,
  });
  const resp = await fetch(`${GATEWAY_URL}/smtp/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": BREVO_API_KEY!,
    },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  console.log("[brevo] response", resp.status, text.slice(0, 500));
  // Brevo returns 201 with { messageId } on success. Treat anything without messageId as failure.
  const ok = resp.ok && !!(json && (json.messageId || json.messageIds));
  return { ok, status: resp.status, body: json ?? text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!LOVABLE_API_KEY || !BREVO_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY or BREVO_API_KEY" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: SendBody = await req.json();
    const filters = body.segment_filters || {};

    // Sender config fallback
    let senderEmail = body.sender_email;
    let senderName = body.sender_name;
    let replyTo = body.reply_to;
    if (!senderEmail || !senderName) {
      const { data: cfg } = await admin.from("broadcast_sender_config").select("*").limit(1).maybeSingle();
      senderEmail = senderEmail || cfg?.sender_email || "news@reybaud-app.com";
      senderName = senderName || cfg?.sender_name || "Reybaud";
      replyTo = replyTo || cfg?.reply_to || undefined;
    }

    const cta = { url: body.cta_url, label: body.cta_label };
    const excludedSet = new Set((body.excluded_emails || []).map((e) => e.toLowerCase()));

    // Preview count only
    if (body.mode === "preview_count") {
      const rows = await loadRecipients(admin, filters);
      const filtered = rows.filter((r: any) => !excludedSet.has(r.email.toLowerCase()));
      const mapped = filtered.map((r: any) => ({
        email: r.email,
        nombre: r.display_name || `${r.nombre ?? ""} ${r.apellido ?? ""}`.trim(),
        type: r.contact_type,
      }));
      return new Response(JSON.stringify({
        count: filtered.length,
        sample: mapped.slice(0, 5),
        recipients: body.include_full_list ? mapped : undefined,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Test send
    if (body.mode === "test") {
      if (!body.test_email || !body.subject || !body.content_html) {
        return new Response(JSON.stringify({ error: "Faltan test_email, subject o content_html" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const html = htmlWrap(body.content_html, body.preheader, cta);
      const r = await sendOne({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: body.test_email }],
        replyTo: replyTo ? { email: replyTo } : undefined,
        subject: `[TEST] ${body.subject}`,
        htmlContent: html,
      });
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, response: r.body }), {
        status: r.ok ? 200 : r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Real send
    if (body.mode === "send") {
      if (!body.subject || !body.content_html) {
        return new Response(JSON.stringify({ error: "Faltan subject o content_html" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const allRecipients = await loadRecipients(admin, filters);
      const recipients = allRecipients.filter((r: any) => !excludedSet.has(r.email.toLowerCase()));
      if (!recipients.length) {
        return new Response(JSON.stringify({ error: "Sin destinatarios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: bc, error: bcErr } = await admin.from("broadcasts").insert({
        subject: body.subject,
        content_html: body.content_html,
        preheader: body.preheader,
        sender_email: senderEmail,
        sender_name: senderName,
        reply_to: replyTo,
        segment_filters: filters as any,
        status: "sending",
        total_recipients: recipients.length,
        created_by: user.id,
      }).select().single();
      if (bcErr) throw bcErr;

      // pre-insert recipient rows
      await admin.from("broadcast_recipients").insert(
        recipients.map((r: any) => ({
          broadcast_id: bc.id,
          alumno_id: r.contact_type === "alumno" ? r.id : null,
          email: r.email,
          name: r.display_name || `${r.nombre ?? ""} ${r.apellido ?? ""}`.trim(),
          status: "pending",
        }))
      );

      let sent = 0, failed = 0;
      const html = htmlWrap(body.content_html, body.preheader, cta);

      for (const r of recipients) {
        const r1 = await sendOne({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: r.email, name: r.display_name || undefined }],
          replyTo: replyTo ? { email: replyTo } : undefined,
          subject: body.subject,
          htmlContent: html,
          tags: ["broadcast", bc.id],
        });
        if (r1.ok) {
          sent++;
          await admin.from("broadcast_recipients").update({
            status: "sent",
            brevo_message_id: r1.body?.messageId ?? null,
            sent_at: new Date().toISOString(),
          }).eq("broadcast_id", bc.id).eq("email", r.email);
        } else {
          failed++;
          await admin.from("broadcast_recipients").update({
            status: "failed",
            error_message: typeof r1.body === "string" ? r1.body : JSON.stringify(r1.body),
          }).eq("broadcast_id", bc.id).eq("email", r.email);
        }
        // tiny delay to avoid burst
        await new Promise((res) => setTimeout(res, 50));
      }

      await admin.from("broadcasts").update({
        status: failed === recipients.length ? "failed" : "sent",
        sent_count: sent,
        failed_count: failed,
        sent_at: new Date().toISOString(),
      }).eq("id", bc.id);

      return new Response(JSON.stringify({ ok: true, broadcast_id: bc.id, sent, failed, total: recipients.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "modo inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-broadcast error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
