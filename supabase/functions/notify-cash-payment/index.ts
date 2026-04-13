import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Ciclismo Reybaud";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { alumno_id, plan_id, suscripcion_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: alumno } = await supabase
      .from("alumnos")
      .select("nombre, email")
      .eq("id", alumno_id)
      .single();

    const { data: plan } = await supabase
      .from("planes")
      .select("nombre, precio")
      .eq("id", plan_id)
      .single();

    if (!alumno || !plan) {
      return new Response(JSON.stringify({ error: "Datos no encontrados" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const messageId = crypto.randomUUID();
    const emailPayload = {
      message_id: messageId,
      to: adminEmails.join(", "),
      from: `${FROM_NAME} <noreply@${SENDER_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: `💵 Pago en efectivo: ${alumno.nombre} — ${plan.nombre}`,
      html: emailHtml,
      text: '',
      purpose: 'transactional',
      label: 'cash_payment_notification',
      idempotency_key: messageId,
      queued_at: new Date().toISOString(),
    };

    const { error: enqueueErr } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: emailPayload,
    });

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
