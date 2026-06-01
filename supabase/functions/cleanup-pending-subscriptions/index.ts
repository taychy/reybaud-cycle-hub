import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Cancela suscripciones "zombi": estado pendiente, método mercadopago,
 * sin mp_payment_id confirmado, creadas hace más de 48 horas.
 * Pensado para ejecutarse cada N horas vía pg_cron.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("suscripciones")
      .update({
        estado: "cancelada",
        cancelada_at: new Date().toISOString(),
        cancelada_motivo: "Pago no confirmado por Mercado Pago (timeout 48h)",
      })
      .eq("estado", "pendiente")
      .eq("metodo_pago", "mercadopago")
      .is("mp_payment_id", null)
      .lt("created_at", cutoff)
      .select("id");

    if (error) {
      console.error("cleanup-pending-subscriptions error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Cleanup: cancelled ${data?.length ?? 0} zombie pending subs`);

    return new Response(
      JSON.stringify({ cancelled: data?.length ?? 0, ids: data?.map((d) => d.id) ?? [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("cleanup-pending-subscriptions exception:", e);
    return new Response(
      JSON.stringify({ error: "internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
