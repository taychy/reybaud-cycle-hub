// Sends a test email to the configured admin_notification_emails list.
// Super-admin only. Does not block any flow if it fails.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Reybaud Ciclismo";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claims.claims.sub;

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isSuper } = await sb.rpc("is_super_admin", { _user_id: userId });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Only super_admin" }), { status: 403, headers: corsHeaders });
    }

    const { data: cfg } = await sb.from("app_config").select("value").eq("key", "admin_notification_emails").single();
    const emails: string[] = Array.isArray(cfg?.value) ? cfg.value as string[] : [];
    if (emails.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "no_recipients" }), { headers: corsHeaders });
    }

    const messageId = `test-${crypto.randomUUID()}`;
    // Preferir plantilla editable en DB; fallback al HTML original si no existe
    const { data: tpl } = await sb
      .from("email_templates")
      .select("subject, html_body, is_active")
      .eq("key", "admin_test_email")
      .maybeSingle();
    const interpolate = (s: string, vars: Record<string, string>) =>
      s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
    const vars = { timestamp: new Date().toISOString() };
    const subject = tpl?.is_active !== false && tpl?.subject
      ? interpolate(tpl.subject, vars)
      : "✅ Email de prueba — Reybaud Admin";
    const html = tpl?.is_active !== false && tpl?.html_body
      ? interpolate(tpl.html_body, vars)
      : `<div style="font-family:system-ui,sans-serif;color:#111;max-width:560px"><h2>Email de prueba</h2><p>Si recibís este mensaje, el dominio de envío y la cola de notificaciones funcionan correctamente.</p><p style="color:#6b7280;font-size:12px">${vars.timestamp}</p></div>`;


    const results: any[] = [];
    for (const to of emails) {
      const { error: enqErr } = await sb.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: `${messageId}-${to}`,
          to, from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject, html, text: "Email de prueba — Reybaud Admin",
          purpose: "transactional", label: "admin_test_email",
          idempotency_key: `${messageId}-${to}`,
          queued_at: new Date().toISOString(),
        },
      });
      results.push({ to, queued: !enqErr, error: enqErr?.message });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
