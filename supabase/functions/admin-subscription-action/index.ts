// Admin actions over a single subscription:
//  - approve: mark a "pendiente_verificacion" sub as paid/active (preserves fecha_fin)
//  - reject:  revert a "pendiente_verificacion" sub to "vencida" and email the student
//  - simulate_fail: force the auto-charge-failure branch (super admin only) — useful
//                   to QA the email + banner without waiting for MP to actually fail
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM = `Ciclismo Reybaud <noreply@${SENDER_DOMAIN}>`;
const APP_URL = "https://reybaud-app.com";

const getOrCreateUnsubscribeToken = async (admin: any, email: string): Promise<string> => {
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  if (existing?.token) return existing.token;
  const newToken = crypto.randomUUID();
  const { data: inserted, error: insErr } = await admin
    .from("email_unsubscribe_tokens")
    .insert({ email: normalized, token: newToken })
    .select("token")
    .single();
  if (!insErr && inserted?.token) return inserted.token;
  const { data: fallback } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  if (fallback?.token) return fallback.token;
  throw insErr ?? new Error("Could not create unsubscribe token");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const auth = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await auth.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claims.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify admin / super_admin / support — anyone with admin role can validate/reject;
    // simulate_fail is restricted to super_admin only (checked below).
    const { data: adminProfile } = await admin
      .from("admin_profiles")
      .select("email, role")
      .eq("user_id", userId)
      .maybeSingle();
    const role = adminProfile?.role || null;
    const isAdmin = role === "super_admin" || role === "admin" || role === "support";
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json();
    const action = String(body?.action || "");
    const subId = String(body?.sub_id || "");
    if (!subId || !["approve", "reject", "simulate_fail"].includes(action)) {
      return json({ error: "Invalid payload" }, 400);
    }
    if (action === "simulate_fail" && role !== "super_admin") {
      return json({ error: "Only super_admin can simulate failures" }, 403);
    }

    const { data: sub, error: subErr } = await admin
      .from("suscripciones")
      .select("id, alumno_id, plan_id, estado, fecha_fin, fecha_inicio, metodo_pago, origen_registro, mp_status, mp_preapproval_id, intentos_cobro_fallidos, auto_cobro_activo, planes(id, nombre, precio, moneda)")
      .eq("id", subId)
      .maybeSingle();
    if (subErr || !sub) return json({ error: "Subscription not found" }, 404);

    const { data: alumno } = await admin
      .from("alumnos").select("nombre, email").eq("id", sub.alumno_id).maybeSingle();

    const nowIso = new Date().toISOString();

    if (action === "approve") {
      const today = nowIso.split("T")[0];
      // Preserve existing fecha_fin; if missing, add 1 month from today.
      let fechaFin = sub.fecha_fin;
      if (!fechaFin) {
        const ff = new Date();
        ff.setMonth(ff.getMonth() + 1);
        fechaFin = ff.toISOString().split("T")[0];
      }
      const { error: upErr } = await admin.from("suscripciones").update({
        estado: "activa",
        fecha_inicio: sub.fecha_inicio || today,
        fecha_fin: fechaFin,
        mp_status: sub.mp_status || "manual",
        chequeado_admin: true,
        chequeado_admin_at: nowIso,
        chequeado_admin_by: userId,
      }).eq("id", subId);
      if (upErr) return json({ error: upErr.message }, 500);

      await admin.from("alumnos").update({ estado: "activo" }).eq("id", sub.alumno_id);

      // Optional: trigger auto-invoice
      if (sub.planes) {
        admin.functions.invoke("auto-facturar", {
          body: {
            alumno_id: sub.alumno_id,
            concepto: `Suscripción ${(sub.planes as any).nombre}`,
            monto: (sub.planes as any).precio,
            referencia_tipo: "suscripcion",
            referencia_id: sub.id,
            segmento: "escuela",
          },
        }).catch(() => {});
      }

      await logAudit(admin, userId, adminProfile?.email, role, "aprobar_pago_informado", subId, { alumno: alumno?.nombre });
      return json({ ok: true, action });
    }

    if (action === "reject") {
      const reason = String(body?.reason || "").trim();
      const { error: upErr } = await admin.from("suscripciones").update({
        estado: "vencida",
        chequeado_admin: false,
        notas: reason
          ? `[Pago rechazado ${nowIso.split("T")[0]}] ${reason}`
          : `[Pago rechazado ${nowIso.split("T")[0]}]`,
      }).eq("id", subId);
      if (upErr) return json({ error: upErr.message }, 500);

      // Email student
      if (alumno?.email) {
        const unsubscribe_token = await getOrCreateUnsubscribeToken(admin, alumno.email);
        await admin.rpc("enqueue_email" as any, {
          queue_name: "transactional_emails",
          payload: {
            message_id: crypto.randomUUID(),
            to: alumno.email,
            from: FROM,
            sender_domain: SENDER_DOMAIN,
            subject: "No pudimos confirmar tu pago",
            html: rejectHtml(alumno.nombre || "", (sub.planes as any)?.nombre || "tu plan", reason),
            text: `Hola ${alumno.nombre || ""}, no pudimos confirmar el pago de ${(sub.planes as any)?.nombre || "tu plan"}. ${reason ? `Motivo: ${reason}. ` : ""}Reintentá desde ${APP_URL}/perfil?section=suscripciones`,
            purpose: "transactional",
            label: "payment_rejected_student",
            idempotency_key: `pay-rejected-${subId}-${Date.now()}`,
            unsubscribe_token,
            queued_at: nowIso,
          },
        });
      }

      await logAudit(admin, userId, adminProfile?.email, role, "rechazar_pago_informado", subId, { alumno: alumno?.nombre, motivo: reason || null });
      return json({ ok: true, action });
    }

    // simulate_fail
    if (action === "simulate_fail") {
      const newFails = 3;
      const { error: upErr } = await admin.from("suscripciones").update({
        intentos_cobro_fallidos: newFails,
        ultimo_intento_cobro_at: nowIso,
        auto_cobro_activo: false,
        mp_preapproval_status: "paused",
      }).eq("id", subId);
      if (upErr) return json({ error: upErr.message }, 500);

      if (alumno?.email) {
        await admin.rpc("enqueue_email" as any, {
          queue_name: "transactional_emails",
          payload: {
            message_id: crypto.randomUUID(),
            to: alumno.email,
            from: FROM,
            sender_domain: SENDER_DOMAIN,
            subject: "[SIMULACIÓN] No pudimos cobrar tu renovación automática",
            html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222"><div style="background:#fff3cd;border:1px solid #ffe69c;padding:8px 12px;border-radius:6px;margin-bottom:16px;font-size:12px;color:#664d03">⚙️ Este es un mail de prueba disparado por el equipo.</div><h2 style="color:#b8860b;margin-bottom:12px">Hola ${alumno.nombre || ""},</h2><p>Intentamos renovar tu plan <strong>${(sub.planes as any)?.nombre || ""}</strong> automáticamente y la tarjeta fue rechazada.</p><p>Para no perder el acceso, podés pagar manualmente desde tu perfil o actualizar la tarjeta y volver a activar la renovación automática.</p><p style="margin:24px 0"><a href="${APP_URL}/perfil?section=suscripciones" style="background:#b8860b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Pagar ahora</a></p><p style="color:#666;font-size:13px">Si necesitás ayuda, respondé este mail.</p></div>`,
            text: `[SIMULACIÓN] Intentamos renovar tu plan ${(sub.planes as any)?.nombre || ""} y la tarjeta fue rechazada. Pagá manual desde ${APP_URL}/perfil?section=suscripciones`,
            purpose: "transactional",
            label: "auto_charge_failed_student_sim",
            idempotency_key: `auto-fail-sim-${subId}-${Date.now()}`,
            queued_at: nowIso,
          },
        });
      }

      await logAudit(admin, userId, adminProfile?.email, role, "simular_renovacion_fallida", subId, { alumno: alumno?.nombre });
      return json({ ok: true, action, simulated_fails: newFails });
    }

    return json({ error: "Unhandled action" }, 400);
  } catch (e) {
    console.error("admin-subscription-action error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function rejectHtml(nombre: string, planName: string, motivo: string) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
    <h2 style="color:#c0392b;margin-bottom:12px">Hola ${nombre},</h2>
    <p>Revisamos el pago que informaste para <strong>${planName}</strong> y no pudimos confirmarlo en nuestra cuenta.</p>
    ${motivo ? `<p style="background:#fdecea;border-left:3px solid #c0392b;padding:10px 12px;border-radius:4px;color:#7b241c"><strong>Motivo:</strong> ${motivo}</p>` : ""}
    <p>Por favor reintentá el pago o contactanos para resolverlo. Tu suscripción quedó marcada como vencida hasta que se confirme el cobro.</p>
    <p style="margin:24px 0"><a href="${APP_URL}/perfil?section=suscripciones" style="background:#b8860b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Reintentar pago</a></p>
    <p style="color:#666;font-size:13px">Si ya pagaste y creés que es un error, respondé este mail con el comprobante.</p>
  </div>`;
}

async function logAudit(
  admin: ReturnType<typeof createClient>,
  userId: string,
  userEmail: string | null | undefined,
  role: string | null,
  action: string,
  entityId: string,
  details: Record<string, unknown>,
) {
  try {
    await admin.from("audit_log").insert([{
      user_id: userId,
      user_email: userEmail || "",
      user_role: role || "admin",
      action,
      entity_type: "suscripcion",
      entity_id: entityId,
      details,
    }]);
  } catch (e) {
    console.error("audit_log insert failed:", e);
  }
}
