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
    const { plan_id, alumno_id, suscripcion_id } = await req.json();

    if (!plan_id || !alumno_id || !suscripcion_id) {
      return new Response(
        JSON.stringify({ error: "Faltan parámetros requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch plan details
    const { data: plan, error: planError } = await supabaseAdmin
      .from("planes")
      .select("*")
      .eq("id", plan_id)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ error: "Plan no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch alumno details
    const { data: alumno, error: alumnoError } = await supabaseAdmin
      .from("alumnos")
      .select("nombre, email")
      .eq("id", alumno_id)
      .single();

    if (alumnoError || !alumno) {
      return new Response(
        JSON.stringify({ error: "Alumno no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Mercado Pago no está configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the base URL for redirects
    const origin = req.headers.get("origin") || "https://reybaud-cycle-hub.lovable.app";

    // Create Mercado Pago preference
    const preferenceBody = {
      items: [
        {
          title: `Plan ${plan.nombre} - Ciclismo Reybaud`,
          quantity: 1,
          unit_price: Number(plan.precio),
          currency_id: "ARS",
        },
      ],
      payer: {
        name: alumno.nombre,
        email: alumno.email,
      },
      back_urls: {
        success: `${origin}/pago-resultado?status=approved`,
        failure: `${origin}/pago-resultado?status=failure`,
        pending: `${origin}/pago-resultado?status=pending`,
      },
      auto_return: "approved",
      external_reference: suscripcion_id,
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook`,
      statement_descriptor: "CICLISMO REYBAUD",
    };

    const mpResponse = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify(preferenceBody),
      }
    );

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("MP error:", JSON.stringify(mpData));
      return new Response(
        JSON.stringify({ error: "Error al crear preferencia de pago", detail: mpData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update suscripcion with preference id
    await supabaseAdmin
      .from("suscripciones")
      .update({ mp_preference_id: mpData.id })
      .eq("id", suscripcion_id);

    return new Response(
      JSON.stringify({
        init_point: mpData.init_point,
        sandbox_init_point: mpData.sandbox_init_point,
        preference_id: mpData.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
