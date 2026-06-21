// Cron worker (every 1 min): processes admin_notification_events queue.
// - reserva_confirmada → triggers send-reservation-confirmed-with-payment for the alumno
// - other tipos → sends admin email via notify-reservation
// Respects admin notification_prefs to filter recipients per priority.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_DOMAIN = "https://reybaud-app.com";

const PRIORITY_KEY: Record<string, string> = {
  pago: "pagos",
  efectivo: "efectivo_anunciado",
  checklist_critico: "checklist_critico",
  checklist_general: "checklist_general",
  general: "pagos",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const results: any[] = [];

  // Fetch pending or failed (<5 intentos), oldest first, batch of 25
  const { data: events } = await sb
    .from("admin_notification_events")
    .select("*")
    .or("status.eq.pendiente,and(status.eq.fallido,intentos.lt.5)")
    .order("created_at", { ascending: true })
    .limit(25);

  if (!events?.length) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Load admin emails config + admin prefs once
  const { data: cfg } = await sb.from("app_config").select("value").eq("key", "admin_notification_emails").single();
  const adminEmails: string[] = Array.isArray(cfg?.value) ? cfg.value as string[] : [];

  const { data: profs } = await sb.from("admin_profiles").select("email, notification_prefs, status").in("status", ["active", "activo"]);
  const prefByEmail = new Map<string, any>();
  (profs || []).forEach(p => prefByEmail.set((p.email || "").toLowerCase(), p.notification_prefs || {}));

  for (const ev of events) {
    try {
      // Special case: reserva_confirmada → triggers alumno email
      if (ev.tipo === "reserva_confirmada" && ev.reservation_id) {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-reservation-confirmed-with-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ reservation_id: ev.reservation_id }),
        });
        const ok = resp.ok;
        await sb.from("admin_notification_events").update({
          status: ok ? "enviado" : "fallido",
          intentos: (ev.intentos || 0) + 1,
          last_error: ok ? null : `confirm_pay_email_${resp.status}`,
          sent_at: ok ? new Date().toISOString() : null,
        }).eq("id", ev.id);
        await sb.from("audit_log").insert({
          action: ok ? "admin_notification.enviada" : "admin_notification.fallida",
          entity_type: "admin_notification_event", entity_id: ev.id,
          user_role: "edge_function",
          details: { tipo: ev.tipo, intento: (ev.intentos || 0) + 1, http: resp.status },
        });
        results.push({ id: ev.id, ok });
        continue;
      }

      // Generic admin notification: filter recipients by priority pref
      const prefKey = PRIORITY_KEY[ev.prioridad] || "pagos";
      const targets = adminEmails.filter(e => {
        const pref = prefByEmail.get(e.toLowerCase());
        if (!pref) return true; // unknown admin → send by default
        return pref[prefKey] !== false;
      });

      if (targets.length === 0) {
        await sb.from("admin_notification_events").update({
          status: "silenciado", intentos: (ev.intentos || 0) + 1,
        }).eq("id", ev.id);
        results.push({ id: ev.id, silenced: true });
        continue;
      }

      const subject = subjectFor(ev);
      const html = htmlFor(ev);
      const text = textFor(ev);

      // Send via notify-reservation per recipient
      let allOk = true;
      let lastErr: string | null = null;
      for (const to of targets) {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/notify-reservation`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({
            reservation_id: ev.reservation_id,
            tipo: "novedad",
            asunto: subject,
            contenido_html: html,
            contenido_texto: text,
            metadata: { admin_to: to, priority: ev.prioridad, ev_tipo: ev.tipo, payload: ev.payload },
            idempotency_key: `adminev:${ev.id}:${to}`,
          }),
        });
        if (!r.ok) { allOk = false; lastErr = `notify_${r.status}`; }
      }

      await sb.from("admin_notification_events").update({
        status: allOk ? "enviado" : "fallido",
        intentos: (ev.intentos || 0) + 1,
        last_error: allOk ? null : lastErr,
        destinatarios: targets,
        sent_at: allOk ? new Date().toISOString() : null,
      }).eq("id", ev.id);

      await sb.from("audit_log").insert({
        action: allOk ? "admin_notification.enviada" : "admin_notification.fallida",
        entity_type: "admin_notification_event", entity_id: ev.id,
        user_role: "edge_function",
        details: { tipo: ev.tipo, intento: (ev.intentos || 0) + 1, destinatarios: targets, error: lastErr },
      });

      results.push({ id: ev.id, ok: allOk });
    } catch (e: any) {
      await sb.from("admin_notification_events").update({
        status: "fallido", intentos: (ev.intentos || 0) + 1, last_error: e.message,
      }).eq("id", ev.id);
      results.push({ id: ev.id, ok: false, error: e.message });
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function subjectFor(ev: any) {
  switch (ev.tipo) {
    case "efectivo_anunciado": return `💵 Efectivo anunciado — reserva ${shortId(ev.reservation_id)}`;
    case "efectivo_cobrado": return `✅ Efectivo cobrado — reserva ${shortId(ev.reservation_id)}`;
    case "pago_informado": return `💳 Pago informado — reserva ${shortId(ev.reservation_id)}`;
    case "checklist_critico": return `⚠️ Checklist crítico — reserva ${shortId(ev.reservation_id)}`;
    default: return `Novedad reserva ${shortId(ev.reservation_id)}`;
  }
}

function htmlFor(ev: any) {
  const link = ev.reservation_id ? `${APP_DOMAIN}/admin/eventos/participantes?reservation=${ev.reservation_id}` : APP_DOMAIN;
  const p = ev.payload || {};
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;color:#111">
  <h2 style="margin:0 0 12px">${subjectFor(ev)}</h2>
  <pre style="background:#f3f4f6;padding:12px;border-radius:8px;font-size:12px;overflow:auto">${JSON.stringify(p, null, 2)}</pre>
  <p><a href="${link}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">Ver reserva</a></p>
</div>`;
}

function textFor(ev: any) {
  return `${subjectFor(ev)}\n\n${JSON.stringify(ev.payload || {})}\n${APP_DOMAIN}/admin/eventos/participantes?reservation=${ev.reservation_id || ""}`;
}

function shortId(id: string | null) {
  return id ? id.slice(0, 8) : "—";
}
