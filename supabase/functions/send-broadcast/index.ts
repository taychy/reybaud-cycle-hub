// Send broadcast emails via Brevo connector gateway.
// Modes: "test" (single recipient) or "send" (all targeted recipients).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/brevo";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FREQUENCY_DAYS = 7;

interface SegmentFilters {
  audience?: ("students" | "coaches" | "marketing")[];
  estados?: string[];
  sede_ids?: string[];
  grupos?: string[];
  plan_ids?: string[];
  has_email_only?: boolean;
  alumno_ids?: string[];
  coach_ids?: string[];
  // marketing
  marketing_tipos?: string[];          // ['lead','ex_alumno',...]
  marketing_tags?: string[];           // tags a matchear (OR)
  marketing_contact_ids?: string[];    // selección puntual
  marketing_ignore_frequency?: boolean;
  marketing_include_opt_out?: boolean;
}

interface SendBody {
  mode: "test" | "send" | "preview_count";
  test_email?: string;
  broadcast_id?: string;
  subject?: string;
  content_html?: string;
  preheader?: string;
  segment_filters?: SegmentFilters;
  sender_email?: string;
  sender_name?: string;
  reply_to?: string;
  save_as?: "draft" | "sent";
  cta_url?: string;
  cta_label?: string;
  excluded_emails?: string[];
  include_full_list?: boolean;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlWrap(content: string, preheader?: string, cta?: { url?: string; label?: string }) {
  const safe = content.includes("<") && content.includes(">")
    ? content
    : escapeHtml(content).replace(/\n/g, "<br/>");
  const pre = preheader
    ? `<div style="display:none;font-size:1px;color:#121212;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(preheader)}</div>`
    : "";
  const ctaBlock = cta?.url
    ? `<div style="text-align:center;padding:24px 0 8px"><a href="${cta.url}" style="display:inline-block;background:#F08A2A;color:#0a0a0a;padding:14px 28px;border-radius:10px;font-weight:700;text-decoration:none;font-family:Inter,Arial,sans-serif">${escapeHtml(cta.label || "Ver más")}</a></div>`
    : "";
  const bodyHtml = `<div style="font-size:15px;line-height:1.6;color:#e8e8e8">${safe}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
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

function encodeUrlValue(value: unknown) {
  return encodeURIComponent(String(value ?? ""));
}

function personalize(value: string | undefined, recipient: any) {
  if (!value) return value;
  const nombre = recipient?.display_name || `${recipient?.nombre ?? ""} ${recipient?.apellido ?? ""}`.trim();
  const email = recipient?.email || "";
  return value
    .replaceAll("{nombre_url}", encodeUrlValue(nombre))
    .replaceAll("{email_url}", encodeUrlValue(email))
    .replaceAll("{nombre}", nombre)
    .replaceAll("{email}", email);
}

async function loadRecipients(supabase: any, filters: SegmentFilters) {
  const explicitSelection = Boolean(
    filters.alumno_ids?.length ||
    filters.coach_ids?.length ||
    filters.marketing_contact_ids?.length
  );
  const audience = Array.isArray(filters.audience) ? filters.audience : ["students"];
  let rows: any[] = [];

  // --- ALUMNOS ---
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

  // --- COACHES ---
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

  // --- MARKETING CONTACTS ---
  if ((filters.marketing_contact_ids?.length || (!explicitSelection && audience.includes("marketing")))) {
    let q = supabase.from("marketing_contacts").select(
      "id, email, nombre, apellido, tipo, tags, opt_in_marketing, last_campaign_sent_at"
    );
    if (filters.marketing_contact_ids?.length) {
      q = q.in("id", filters.marketing_contact_ids);
    } else {
      if (!filters.marketing_include_opt_out) q = q.eq("opt_in_marketing", true);
      if (filters.marketing_tipos?.length) q = q.in("tipo", filters.marketing_tipos);
      if (filters.marketing_tags?.length) q = q.overlaps("tags", filters.marketing_tags);
      // Frequency cap (7 días)
      if (!filters.marketing_ignore_frequency) {
        const cutoff = new Date(Date.now() - FREQUENCY_DAYS * 24 * 60 * 60 * 1000).toISOString();
        // last_campaign_sent_at IS NULL OR <= cutoff
        q = q.or(`last_campaign_sent_at.is.null,last_campaign_sent_at.lte.${cutoff}`);
      }
    }
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []).map((m: any) => ({
      id: m.id,
      email: m.email,
      nombre: m.nombre,
      apellido: m.apellido,
      contact_type: "marketing",
      marketing_tipo: m.tipo,
      display_name: `${m.nombre ?? ""} ${m.apellido ?? ""}`.trim() || m.email,
    })));
  }

  rows = rows.filter((a: any) => a.email && a.email.includes("@"));

  // exclude suppressed (rebotes / quejas)
  const emails = rows.map((r: any) => r.email.toLowerCase());
  if (emails.length) {
    const { data: sup } = await supabase
      .from("suppressed_emails")
      .select("email")
      .in("email", emails);
    const supSet = new Set((sup || []).map((s: any) => s.email.toLowerCase()));
    rows = rows.filter((r: any) => !supSet.has(r.email.toLowerCase()));
  }

  // de-dupe by email (prioriza alumno > coach > marketing)
  const priority: Record<string, number> = { alumno: 0, coach: 1, marketing: 2 };
  rows.sort((a, b) => (priority[a.contact_type] ?? 9) - (priority[b.contact_type] ?? 9));
  const seen = new Set<string>();
  return rows.filter((r: any) => {
    const k = r.email.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function sendOne(payload: any) {
  console.log("[brevo] POST /smtp/email", { from: payload?.sender, to: payload?.to, subject: payload?.subject });
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

    let senderEmail = body.sender_email;
    let senderName = body.sender_name;
    let replyTo = body.reply_to;
    if (!senderEmail || !senderName) {
      const { data: cfg } = await admin.from("broadcast_sender_config").select("*").limit(1).maybeSingle();
      senderEmail = senderEmail || cfg?.sender_email || "news@reybaud-app.com";
      senderName = senderName || cfg?.sender_name || "Reybaud";
      replyTo = replyTo || cfg?.reply_to || undefined;
    }

    const excludedSet = new Set((body.excluded_emails || []).map((e) => e.toLowerCase()));

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
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (body.mode === "test") {
      if (!body.test_email || !body.subject || !body.content_html) {
        return new Response(JSON.stringify({ error: "Faltan test_email, subject o content_html" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const testRecipient = { email: body.test_email, display_name: "Test Reybaud" };
      const html = htmlWrap(
        personalize(body.content_html, testRecipient) || "",
        body.preheader,
        { url: personalize(body.cta_url, testRecipient), label: body.cta_label },
      );
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
      const marketingSentEmails: string[] = [];
      for (const r of recipients) {
        const html = htmlWrap(
          personalize(body.content_html, r) || "",
          body.preheader,
          { url: personalize(body.cta_url, r), label: body.cta_label },
        );
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
          if (r.contact_type === "marketing") marketingSentEmails.push(r.email.toLowerCase());
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
        await new Promise((res) => setTimeout(res, 50));
      }

      // actualizar last_campaign_sent_at de marketing_contacts enviados
      if (marketingSentEmails.length) {
        await admin
          .from("marketing_contacts")
          .update({ last_campaign_sent_at: new Date().toISOString() })
          .in("email", marketingSentEmails);
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
