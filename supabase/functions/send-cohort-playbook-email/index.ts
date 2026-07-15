// Sends a chosen email template from `email_templates` to all active subscribers of a cohort (plan).
// Called from the admin Programa Flujo runner when a stage's accion_final is 'send_cohort_email'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Reybaud Ciclismo";

const interpolate = (s: string, vars: Record<string, string>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);

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
    const userId = claims?.claims?.sub;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Only admin" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const plan_id: string = body.plan_id;
    const template_key: string = body.template_key;
    const instance_id: string | null = body.instance_id ?? null;
    const stage_id: string | null = body.stage_id ?? null;
    if (!plan_id || !template_key) {
      return new Response(JSON.stringify({ error: "plan_id and template_key required" }), { status: 400, headers: corsHeaders });
    }

    const { data: tpl } = await sb
      .from("email_templates")
      .select("subject, html_body, text_body, is_active")
      .eq("key", template_key)
      .maybeSingle();
    if (!tpl || tpl.is_active === false) {
      return new Response(JSON.stringify({ error: "template_not_active" }), { status: 400, headers: corsHeaders });
    }

    const { data: plan } = await sb.from("planes").select("nombre, fecha_inicio_programa").eq("id", plan_id).maybeSingle();

    // Inscriptos activos/pendientes
    const { data: subs } = await sb
      .from("suscripciones")
      .select("alumno_id, estado")
      .eq("plan_id", plan_id)
      .in("estado", ["activa", "pendiente_pago", "pendiente_verificacion"]);
    const alumnoIds = Array.from(new Set((subs || []).map((s: any) => s.alumno_id).filter(Boolean)));
    if (alumnoIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: "no_recipients" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: alumnos } = await sb
      .from("alumnos")
      .select("id, nombre, apellido, email")
      .in("id", alumnoIds);
    const targets = (alumnos || []).filter((a: any) => a.email);

    const messageId = `cohort-${plan_id}-${stage_id || crypto.randomUUID()}`;
    const results: any[] = [];
    for (const a of targets) {
      const vars: Record<string, string> = {
        nombre: (a.nombre || "").trim(),
        apellido: (a.apellido || "").trim(),
        programa: plan?.nombre || "el programa",
        fecha_inicio: plan?.fecha_inicio_programa || "",
      };
      const subject = interpolate(tpl.subject || "", vars);
      const html = interpolate(tpl.html_body || "", vars);
      const text = tpl.text_body ? interpolate(tpl.text_body, vars) : undefined;
      const idem = `${messageId}-${a.email}`;
      const { error: enqErr } = await sb.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: idem,
          to: a.email, from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject, html, text,
          purpose: "transactional", label: `cohort_playbook_${template_key}`,
          idempotency_key: idem,
          queued_at: new Date().toISOString(),
        },
      });
      results.push({ to: a.email, queued: !enqErr, error: enqErr?.message });
    }

    return new Response(JSON.stringify({ ok: true, sent: results.filter(r => r.queued).length, total: targets.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
