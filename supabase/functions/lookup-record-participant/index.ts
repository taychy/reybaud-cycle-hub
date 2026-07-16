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
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Optional authenticated caller — if JWT proves the email, we may return token directly
    let authedEmail: string | null = null;
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      try {
        const userClient = createClient(SUPABASE_URL, ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const jwt = authHeader.replace("Bearer ", "");
        const { data: claimsData } = await userClient.auth.getClaims(jwt);
        const em = claimsData?.claims?.email;
        if (em) authedEmail = String(em).toLowerCase();
      } catch (_) { /* ignore */ }
    }

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
      .select("public_access_token, first_name, email, event_reservation_id")
      .eq("event_id", eventId)
      .ilike("email", e)
      .maybeSingle();

    if (!p) {
      // Do not disclose whether email exists
      return json({ ok: true, sent: true }, 200);
    }

    // Send the access link by email instead of returning the token in the response
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-event-checkin-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          email: p.email,
          first_name: p.first_name,
          token: p.public_access_token,
          reservation_id: p.event_reservation_id,
        }),
      });
    } catch (mailErr) {
      console.warn("lookup-record-participant: mail send failed", mailErr);
    }

    return json({ ok: true, sent: true }, 200);
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
