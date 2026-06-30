import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Ciclismo Reybaud";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
async function getOrCreateUnsubscribeToken(supabase: any, email: string): Promise<string> {
  const e = normalizeEmail(email);
  const { data: ex } = await supabase.from('email_unsubscribe_tokens').select('token').eq('email', e).maybeSingle();
  if (ex?.token) return ex.token;
  const t = crypto.randomUUID();
  const { data: ins, error } = await supabase.from('email_unsubscribe_tokens').insert({ email: e, token: t }).select('token').single();
  if (!error && ins?.token) return ins.token;
  const { data: fb } = await supabase.from('email_unsubscribe_tokens').select('token').eq('email', e).maybeSingle();
  if (fb?.token) return fb.token;
  throw error ?? new Error('Could not create unsubscribe token');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { alumno_id, plan_id, suscripcion_id, payment_type, tipo } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: alumno } = await supabase
      .from("alumnos")
      .select("nombre, email")
      .eq("id", alumno_id)
      .single();

    let resolvedPlanId = plan_id ?? null;

    if (!resolvedPlanId) {
      const { data: latestSub } = await supabase
        .from("suscripciones")
        .select("id, plan_id")
        .eq("alumno_id", alumno_id)
        .in("estado", ["activa", "cancelada", "vencida"])
        .order("fecha_fin", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      resolvedPlanId = latestSub?.plan_id ?? null;
    }

    const { data: plan } = resolvedPlanId
      ? await supabase
          .from("planes")
          .select("nombre, precio")
          .eq("id", resolvedPlanId)
          .single()
      : { data: null };

    if (!alumno || !plan || !resolvedPlanId) {
      return new Response(JSON.stringify({ error: "Datos no encontrados" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const fechaInicio = now.toISOString().split("T")[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fechaFin = lastDay.toISOString().split("T")[0];
    const metodoPago = payment_type === "plataforma_externa" || tipo === "pago_externo"
      ? "plataforma_externa"
      : payment_type || "efectivo";

    if (suscripcion_id) {
      await supabase
        .from("suscripciones")
        .update({
          estado: "pendiente_verificacion",
          plan_id: resolvedPlanId,
          metodo_pago: metodoPago,
          origen_registro: "informado_alumno",
        })
        .eq("id", suscripcion_id)
        .eq("alumno_id", alumno_id);
    } else {
      const { data: existingPending } = await supabase
        .from("suscripciones")
        .select("id")
        .eq("alumno_id", alumno_id)
        .eq("plan_id", resolvedPlanId)
        .eq("estado", "pendiente_verificacion")
        .eq("origen_registro", "informado_alumno")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existingPending) {
        await supabase.from("suscripciones").insert({
          alumno_id,
          plan_id: resolvedPlanId,
          estado: "pendiente_verificacion",
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          metodo_pago: metodoPago,
          origen_registro: "informado_alumno",
          notas: "Pago informado desde botón de renovación",
          precio_base: plan.precio,
          precio_final: plan.precio,
        });
      }
    }

    const adminEmails = ["scarlettbonatto@gmail.com"];

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #b8860b; margin-bottom: 16px;">💵 Pago en efectivo informado</h2>
        <p style="color: #333; margin-bottom: 16px;">Un alumno informó que realizó un pago en efectivo. <strong>Requiere tu verificación</strong> para activar la suscripción.</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #666;">Alumno</td><td style="padding: 8px 0; font-weight: 600;">${alumno.nombre}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Email</td><td style="padding: 8px 0;">${alumno.email}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Plan</td><td style="padding: 8px 0; font-weight: 600;">${plan.nombre}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Precio</td><td style="padding: 8px 0; font-weight: 600; color: #b8860b;">$${plan.precio}</td></tr>
        </table>
        <p style="color: #666; font-size: 14px; margin-top: 20px;">
          Ingresá al panel de administración para confirmar o rechazar este pago.
        </p>
      </div>
    `;

    for (const adminEmail of adminEmails) {
      const messageId = crypto.randomUUID();
      const unsubToken = await getOrCreateUnsubscribeToken(supabase, adminEmail);
      const emailPayload = {
        message_id: messageId,
        to: adminEmail,
        from: `${FROM_NAME} <noreply@${SENDER_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: `💵 Pago en efectivo: ${alumno.nombre} — ${plan.nombre}`,
        html: emailHtml,
        text: '',
        purpose: 'transactional',
        label: 'cash_payment_notification',
        idempotency_key: `${messageId}-${adminEmail}`,
        queued_at: new Date().toISOString(),
        unsubscribe_token: unsubToken,
      };
      const { error: enqueueErr } = await supabase.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: emailPayload,
      });
      if (enqueueErr) console.error("Queue error:", enqueueErr.message);
    }
    const enqueueErr = null as any;

    if (enqueueErr) {
      console.error("Queue error:", enqueueErr.message);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
