import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  try {
    const { plan_id, alumno_id, suscripcion_id } = await req.json();

    if (!plan_id || !alumno_id || !suscripcion_id ||
        !UUID_RE.test(String(plan_id)) ||
        !UUID_RE.test(String(alumno_id)) ||
        !UUID_RE.test(String(suscripcion_id))) {
      return new Response(
        JSON.stringify({ error: "Solicitud inválida" }),
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

    // Verify suscripcion belongs to alumno and matches plan (prevents cross-account abuse)
    const { data: sub, error: subError } = await supabaseAdmin
      .from("suscripciones")
      .select("id, alumno_id, plan_id, precio_base, precio_final")
      .eq("id", suscripcion_id)
      .maybeSingle();

    if (subError || !sub || sub.alumno_id !== alumno_id || sub.plan_id !== plan_id) {
      return new Response(
        JSON.stringify({ error: "Solicitud inválida" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fase 2: resolver cuenta MP por unidad de negocio
    const cuenta = await resolveCuentaMP(supabaseAdmin, { unidad_negocio: "suscripcion_escuela" });
    if (!cuenta.access_token) {
      return new Response(
        JSON.stringify({ error: "Mercado Pago no está configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("[create-mp-preference] cuenta MP:", { slug: cuenta.slug, source: cuenta.source });


    // Build the base URL for redirects
    const origin = req.headers.get("origin") || "https://reybaud-cycle-hub.lovable.app";

    // Precio final: prioriza el de la suscripción (incluye becas/descuentos), con fallback al plan
    const unitPrice = Number(sub.precio_final ?? sub.precio_base ?? plan.precio);
    const hasDiscount = sub.precio_base != null && sub.precio_final != null && Number(sub.precio_final) < Number(sub.precio_base);

    // Create Mercado Pago preference
    const preferenceBody = {
      items: [
        {
          title: `Plan ${plan.nombre}${hasDiscount ? " (con descuento aplicado)" : ""} - Ciclismo Reybaud`,
          quantity: 1,
          unit_price: unitPrice,
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
          Authorization: `Bearer ${cuenta.access_token}`,
        },
        body: JSON.stringify(preferenceBody),
      }
    );

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("[create-mp-preference] MP error:", JSON.stringify(mpData));
      return new Response(
        JSON.stringify({ error: "Error al crear preferencia de pago" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update suscripcion with preference id + cuenta usada
    await supabaseAdmin
      .from("suscripciones")
      .update({ mp_preference_id: mpData.id, cuenta_mp_id: cuenta.cuenta_id })
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
