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
}

function htmlWrap(content: string, preheader?: string) {
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e2e8f0">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111827;border-radius:12px;overflow:hidden">
      <tr><td style="padding:28px 28px 16px;text-align:left;border-bottom:1px solid #1f2937">
        <div style="font-family:Oswald,Impact,sans-serif;font-size:22px;letter-spacing:2px;color:#f97316;font-weight:600">REYBAUD</div>
      </td></tr>
      <tr><td style="padding:24px 28px;color:#e2e8f0;font-size:15px;line-height:1.6">${content}</td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid #1f2937;color:#64748b;font-size:11px;text-align:center">
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
  return { ok: resp.ok, status: resp.status, body: json ?? text };
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

    // Preview count only
    if (body.mode === "preview_count") {
      const rows = await loadRecipients(admin, filters);
      return new Response(JSON.stringify({
        count: rows.length,
        sample: rows.slice(0, 5).map((r: any) => ({
          email: r.email,
          nombre: r.display_name || `${r.nombre ?? ""} ${r.apellido ?? ""}`.trim(),
          type: r.contact_type,
        })),
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
      const html = htmlWrap(body.content_html, body.preheader);
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
      const recipients = await loadRecipients(admin, filters);
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
      const html = htmlWrap(body.content_html, body.preheader);

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
