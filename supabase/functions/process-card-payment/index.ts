import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const body = await req.json();
    const {
      token,
      issuer_id,
      payment_method_id,
      transaction_amount,
      installments,
      payer,
      suscripcion_id,
      alumno_id,
      plan_id,
    } = body;

    if (!token || !suscripcion_id) {
      return new Response(
        JSON.stringify({ error: "Faltan parámetros requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Mercado Pago no configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Process payment via MP API
    const paymentBody = {
      token,
      issuer_id,
      payment_method_id,
      transaction_amount: Number(transaction_amount),
      installments: Number(installments),
      payer: {
        email: payer?.email || "",
        identification: payer?.identification || {},
      },
      external_reference: suscripcion_id,
      description: "Suscripción Ciclismo Reybaud",
      statement_descriptor: "CICLISMO REYBAUD",
    };

    console.log("Processing card payment:", { suscripcion_id, amount: transaction_amount });

    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "X-Idempotency-Key": suscripcion_id,
      },
      body: JSON.stringify(paymentBody),
    });

    const mpData = await mpResponse.json();
    console.log("MP payment response:", {
      status: mpData.status,
      status_detail: mpData.status_detail,
      id: mpData.id,
    });

    // Update subscription based on payment result
    const now = new Date().toISOString().split("T")[0];
    const endOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    ).toISOString().split("T")[0];

    if (mpData.status === "approved") {
      const { error: updateErr } = await supabaseAdmin
        .from("suscripciones")
        .update({
          estado: "activa",
          mp_payment_id: String(mpData.id),
          mp_status: mpData.status,
          metodo_pago: "mercadopago",
          origen_registro: "automatico",
          fecha_inicio: now,
          fecha_fin: endOfMonth,
        })
        .eq("id", suscripcion_id);

      if (updateErr) {
        console.error("Error updating subscription (possible duplicate):", updateErr);
      }

      // Activate student
      await supabaseAdmin
        .from("alumnos")
        .update({ estado: "activo" })
        .eq("id", alumno_id);
    } else if (mpData.status === "in_process") {
      await supabaseAdmin
        .from("suscripciones")
        .update({
          estado: "pendiente",
          mp_payment_id: String(mpData.id),
          mp_status: mpData.status,
          metodo_pago: "mercadopago",
          origen_registro: "automatico",
        })
        .eq("id", suscripcion_id);
    } else {
      await supabaseAdmin
        .from("suscripciones")
        .update({
          estado: "cancelada",
          mp_payment_id: mpData.id ? String(mpData.id) : null,
          mp_status: mpData.status || "rejected",
          metodo_pago: "mercadopago",
          origen_registro: "automatico",
        })
        .eq("id", suscripcion_id);
    }

    return new Response(
      JSON.stringify({
        status: mpData.status,
        status_detail: mpData.status_detail,
        payment_id: mpData.id,
      }),
      { status: mpResponse.ok ? 200 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Card payment error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno al procesar el pago" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
