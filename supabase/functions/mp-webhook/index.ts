import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");
    const body = await req.json().catch(() => ({}));

    console.log("Webhook received:", { topic, body });

    // MP sends different notification types
    // We care about "payment" notifications
    const dataId = body?.data?.id || url.searchParams.get("data.id");
    const notificationType = topic || body?.type || body?.action;

    if (!dataId || (notificationType !== "payment" && notificationType !== "payment.updated" && notificationType !== "payment.created")) {
      console.log("Ignoring notification:", notificationType);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch payment details from MP API
    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) {
      console.error("MP_ACCESS_TOKEN not configured");
      return new Response(JSON.stringify({ error: "MP not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${dataId}`,
      {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      }
    );

    const payment = await paymentRes.json();
    console.log("Payment details:", {
      id: payment.id,
      status: payment.status,
      external_reference: payment.external_reference,
    });

    if (!payment.external_reference) {
      console.log("No external_reference, skipping");
      return new Response(JSON.stringify({ ok: true, no_ref: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const suscripcionId = payment.external_reference;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Map MP status to our status
    let estado: string;
    switch (payment.status) {
      case "approved":
        estado = "activa";
        break;
      case "pending":
      case "in_process":
        estado = "pendiente";
        break;
      case "rejected":
      case "cancelled":
        estado = "cancelada";
        break;
      default:
        estado = "pendiente";
    }

    // Update subscription
    const today = new Date().toISOString().split("T")[0];
    // fecha_fin = last day of the current month at 23:59
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fechaFin = lastDayOfMonth.toISOString().split("T")[0];

    const updateData: Record<string, unknown> = {
      estado,
      mp_payment_id: String(payment.id),
      mp_status: payment.status,
    };

    if (payment.status === "approved") {
      updateData.fecha_inicio = today;
      updateData.fecha_fin = fechaFin;
    }

    const { error: updateError } = await supabaseAdmin
      .from("suscripciones")
      .update(updateData)
      .eq("id", suscripcionId);

    if (updateError) {
      console.error("Error updating subscription:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update subscription" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If approved, also activate the student
    if (payment.status === "approved") {
      const { data: sub } = await supabaseAdmin
        .from("suscripciones")
        .select("alumno_id")
        .eq("id", suscripcionId)
        .single();

      if (sub?.alumno_id) {
        await supabaseAdmin
          .from("alumnos")
          .update({ estado: "activo" })
          .eq("id", sub.alumno_id);

        console.log("Student activated:", sub.alumno_id);
      }
    }

    console.log("Subscription updated:", { suscripcionId, estado });

    return new Response(
      JSON.stringify({ ok: true, status: estado }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
