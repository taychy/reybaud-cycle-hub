// Edge function: get-event-participant-by-token
// Etapa 2A.1 — Reemplaza el SELECT/UPDATE público abierto a event_participants.
// Acciones:
//   action = "get"            -> devuelve los datos de la fila correspondiente al token
//   action = "submit_distance"-> actualiza la distancia/comentario del participante por token
//   action = "ranking"        -> devuelve ranking del evento sin PII
// verify_jwt = false (público pero protegido por token)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Body = {
  action?: "get" | "submit_distance" | "ranking";
  token?: string;
  event_id?: string;
  distance_km?: number;
  comment?: string | null;
};

const TOKEN_RE = /^[a-f0-9]{32,128}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json().catch(() => ({}))) as Body;
    const action = body.action ?? "get";

    // ---------- ranking (no requiere token) ----------
    if (action === "ranking") {
      const eventId = body.event_id;
      if (!eventId) return json({ error: "missing_event_id" }, 400);
      const { data, error } = await supabase
        .from("event_participants")
        .select("id, first_name, last_name, team_name, time_value, status, position, results_updated_at")
        .eq("event_id", eventId)
        .not("time_value", "is", null);
      if (error) return json({ error: "ranking_failed", detail: error.message }, 500);
      return json({ ok: true, ranking: data ?? [] });
    }

    // ---------- acciones que requieren token ----------
    const token = (body.token || "").trim();
    if (!TOKEN_RE.test(token)) return json({ error: "invalid_token" }, 400);

    const { data: p, error: pErr } = await supabase
      .from("event_participants")
      .select(
        "id, first_name, last_name, email, team_name, status, score, time_result, time_value, position, staff_feedback, results_updated_at, participant_comment, rejection_reason, event_id, public_access_token, token_expires_at"
      )
      .eq("public_access_token", token)
      .maybeSingle();

    if (pErr) return json({ error: "lookup_failed", detail: pErr.message }, 500);
    if (!p) return json({ error: "not_found" }, 404);

    if (p.token_expires_at && new Date(p.token_expires_at) < new Date()) {
      return json({ error: "token_expired" }, 410);
    }

    if (action === "get") {
      // Nunca devolver el token en la respuesta.
      const { public_access_token: _omit, token_expires_at: _omit2, ...safe } = p as any;
      return json({ ok: true, participant: safe });
    }

    if (action === "submit_distance") {
      const km = Number(body.distance_km);
      if (!Number.isFinite(km) || km <= 0 || km > 1000) {
        return json({ error: "invalid_distance" }, 400);
      }
      const comment =
        typeof body.comment === "string" && body.comment.trim().length > 0
          ? body.comment.trim().slice(0, 1000)
          : null;

      const { data: updated, error: uErr } = await supabase
        .from("event_participants")
        .update({
          time_value: km,
          time_result: `${km.toFixed(2)} km`,
          participant_comment: comment,
          status: "result_submitted",
          results_updated_at: new Date().toISOString(),
        })
        .eq("id", p.id)
        .select(
          "id, first_name, last_name, team_name, status, time_value, time_result, participant_comment, results_updated_at, position, staff_feedback, rejection_reason, event_id, email, score"
        )
        .single();

      if (uErr || !updated) {
        return json({ error: "update_failed", detail: uErr?.message }, 500);
      }

      return json({
        ok: true,
        participant: updated,
        was_edit:
          p.status === "rejected" ||
          p.status === "result_submitted" ||
          p.status === "approved",
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e: any) {
    console.error("get-event-participant-by-token fatal", e);
    return json({ error: "unexpected", detail: e?.message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
