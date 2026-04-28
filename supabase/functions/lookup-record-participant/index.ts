// Edge function: lookup-record-participant
// Modo "ya me registré": busca el token del participante por email + evento Record activo.
// No expone datos de otros participantes.
// verify_jwt = false

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { email, event_id } = await req.json().catch(() => ({}));
    const e = String(email || "").trim().toLowerCase();
    if (!isEmail(e)) return json({ error: "invalid_email" }, 400);

    let eventId: string | null = event_id || null;
    if (!eventId) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: up } = await supabase
        .from("events")
        .select("id")
        .eq("type", "record_hora")
        .eq("is_active", true)
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(1)
        .maybeSingle();
      eventId = up?.id ?? null;
      if (!eventId) {
        const { data: past } = await supabase
          .from("events")
          .select("id")
          .eq("type", "record_hora")
          .eq("is_active", true)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        eventId = past?.id ?? null;
      }
    }
    if (!eventId) return json({ error: "no_active_event" }, 404);

    const { data: p } = await supabase
      .from("event_participants")
      .select("public_access_token")
      .eq("event_id", eventId)
      .ilike("email", e)
      .maybeSingle();

    if (!p) return json({ found: false }, 200);
    return json({ found: true, token: p.public_access_token, event_id: eventId });
  } catch (e: any) {
    console.error("lookup-record-participant error", e);
    return json({ error: "unexpected", detail: e?.message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
