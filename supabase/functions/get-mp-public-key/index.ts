import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// IMPORTANTE: la public key devuelta acá tokeniza la tarjeta en el frontend.
// Debe pertenecer EXACTAMENTE a la misma cuenta MP que después cobra
// (process-card-payment / create-mp-preapproval con unidad_negocio
// "suscripcion_escuela"). Si no coincide, MP rechaza el token.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cuenta = await resolveCuentaMP(supabaseAdmin, { unidad_negocio: "suscripcion_escuela" });
    console.log("[get-mp-public-key] cuenta MP:", { slug: cuenta.slug, source: cuenta.source });

    if (!cuenta.public_key) {
      console.error("[get-mp-public-key] la cuenta ruteada no tiene public key configurada", {
        slug: cuenta.slug,
        source: cuenta.source,
      });
      return new Response(
        JSON.stringify({
          error:
            "La cuenta de Mercado Pago configurada para suscripciones no tiene public key. Configurala antes de cobrar con tarjeta.",
          cuenta: cuenta.slug,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ public_key: cuenta.public_key, cuenta: cuenta.slug, source: cuenta.source }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-mp-public-key error:", err);
    return new Response(
      JSON.stringify({ error: "No se pudo resolver la configuración de pagos." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
