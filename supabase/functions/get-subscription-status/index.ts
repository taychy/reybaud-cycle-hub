import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const suscripcionId =
      url.searchParams.get("suscripcion_id") ||
      url.searchParams.get("external_reference");
    const mpPaymentId = url.searchParams.get("mp_payment_id");
    const preferenceId = url.searchParams.get("preference_id");

    if (
      (!suscripcionId || !UUID_RE.test(suscripcionId)) &&
      !mpPaymentId &&
      !preferenceId
    ) {
      return new Response(
        JSON.stringify({ error: "missing identifiers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let query = supabaseAdmin
      .from("suscripciones")
      .select("id, estado, mp_status, mp_payment_id, metodo_pago, created_at")
      .limit(1);

    if (suscripcionId && UUID_RE.test(suscripcionId)) {
      query = query.eq("id", suscripcionId);
    } else if (mpPaymentId) {
      query = query.eq("mp_payment_id", mpPaymentId);
    } else if (preferenceId) {
      query = query.eq("mp_preference_id", preferenceId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return new Response(
        JSON.stringify({ error: "lookup failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ found: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        found: true,
        id: data.id,
        estado: data.estado,
        mp_status: data.mp_status,
        mp_payment_id: data.mp_payment_id,
        metodo_pago: data.metodo_pago,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("get-subscription-status error:", e);
    return new Response(
      JSON.stringify({ error: "internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
