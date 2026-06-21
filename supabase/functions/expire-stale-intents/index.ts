// Cron worker (every 5 min): expires stale MP intents.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await sb
    .from("reservation_payment_intents")
    .update({ status: "expirada", resolved_at: new Date().toISOString() })
    .eq("status", "pendiente")
    .lt("expires_at", new Date().toISOString())
    .select("id");
  return new Response(JSON.stringify({ ok: !error, expired: data?.length || 0, error: error?.message }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
