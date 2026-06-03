// Edge function: get-event-participant-by-token
// Etapa 2A.1 — Reemplaza el SELECT/UPDATE público abierto a event_participants.
// Etapa 2B — Agrega flujos para alumno logueado por reserva (sin token público).
// Acciones:
//   action = "get"                          -> datos por token
//   action = "submit_distance"              -> actualizar distancia/comentario por token
//   action = "ranking"                      -> ranking del evento sin PII
//   action = "get_by_reservation"           -> datos del participante asociado a una reserva del alumno logueado
//   action = "submit_distance_authenticated"-> actualizar distancia validando JWT + ownership + checked_in
// verify_jwt = false (token o JWT validados en código)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Body = {
  action?:
    | "get"
    | "submit_distance"
    | "ranking"
    | "get_by_reservation"
    | "submit_distance_authenticated"
    | "trip_get"
    | "trip_save_step";
  token?: string;
  event_id?: string;
  reservation_id?: string;
  distance_km?: number;
  comment?: string | null;
  // trip_save_step
  step_key?: string;
  completed?: boolean;
  needs_advice?: boolean;
  data?: Record<string, unknown>;
  file_url?: string | null;
};

const TOKEN_RE = /^[a-f0-9]{32,128}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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

    // ---------- acciones autenticadas (alumno logueado por reservation) ----------
    if (action === "get_by_reservation" || action === "submit_distance_authenticated") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const jwt = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(jwt);
      if (claimsErr || !claimsData?.claims) return json({ error: "unauthorized" }, 401);

      const userEmail = (claimsData.claims.email || "").toLowerCase();
      if (!userEmail) return json({ error: "no_email_in_token" }, 401);

      const reservationId = (body.reservation_id || "").trim();
      if (!reservationId) return json({ error: "missing_reservation_id" }, 400);

      const { data: reservation, error: rErr } = await supabase
        .from("event_reservations")
        .select("id, alumno_id, event_id, event_participant_id, checkin_at, reservation_status")
        .eq("id", reservationId)
        .maybeSingle();
      if (rErr) return json({ error: "lookup_failed", detail: rErr.message }, 500);
      if (!reservation || !reservation.alumno_id) return json({ error: "not_found" }, 404);

      const { data: alumno } = await supabase
        .from("alumnos")
        .select("id, email")
        .eq("id", reservation.alumno_id)
        .maybeSingle();
      if (!alumno || (alumno.email || "").toLowerCase() !== userEmail) {
        return json({ error: "not_owner" }, 403);
      }

      // Resolver participant
      let participant: any = null;
      if (reservation.event_participant_id) {
        const { data } = await supabase
          .from("event_participants")
          .select(
            "id, first_name, last_name, email, team_name, status, time_value, time_result, participant_comment, results_updated_at, position, staff_feedback, rejection_reason, event_id, checked_in_at"
          )
          .eq("id", reservation.event_participant_id)
          .maybeSingle();
        participant = data;
      }
      if (!participant) {
        const { data } = await supabase
          .from("event_participants")
          .select(
            "id, first_name, last_name, email, team_name, status, time_value, time_result, participant_comment, results_updated_at, position, staff_feedback, rejection_reason, event_id, checked_in_at"
          )
          .eq("event_reservation_id", reservation.id)
          .maybeSingle();
        participant = data;
      }

      if (action === "get_by_reservation") {
        return json({
          ok: true,
          participant,
          reservation: {
            id: reservation.id,
            event_id: reservation.event_id,
            checkin_at: reservation.checkin_at,
            reservation_status: reservation.reservation_status,
          },
        });
      }

      // submit_distance_authenticated
      if (!participant) return json({ error: "participant_not_found" }, 404);
      // Consistencia: el participant debe pertenecer al mismo evento que la reserva
      if (participant.event_id && participant.event_id !== reservation.event_id) {
        return json({ error: "participant_event_mismatch" }, 409);
      }
      if (!reservation.checkin_at && !participant.checked_in_at) {
        return json({ error: "checkin_required" }, 409);
      }
      // Validar que la carga de resultado esté habilitada (respeta metadata.checkin_opens_at).
      const { data: evCheck } = await supabase
        .from("events")
        .select("id, date, metadata")
        .eq("id", reservation.event_id)
        .maybeSingle();
      if (!evCheck?.date) return json({ error: "event_not_found" }, 404);
      const checkinOpensAtRaw = (evCheck as any)?.metadata?.checkin_opens_at as string | undefined;
      if (checkinOpensAtRaw) {
        const opensAt = new Date(checkinOpensAtRaw);
        if (!isNaN(opensAt.getTime()) && new Date() < opensAt) {
          return json({ error: "event_not_started", checkin_opens_at: checkinOpensAtRaw }, 409);
        }
      } else {
        const todayIso = new Date().toISOString().slice(0, 10);
        if (evCheck.date > todayIso) {
          return json({ error: "event_not_started", event_date: evCheck.date }, 409);
        }
      }

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
        .eq("id", participant.id)
        .select(
          "id, first_name, last_name, team_name, status, time_value, time_result, participant_comment, results_updated_at, position, staff_feedback, rejection_reason, event_id, email"
        )
        .single();
      if (uErr || !updated) return json({ error: "update_failed", detail: uErr?.message }, 500);

      return json({
        ok: true,
        participant: updated,
        was_edit:
          participant.status === "rejected" ||
          participant.status === "result_submitted" ||
          participant.status === "approved",
      });
    }

    // ---------- acciones por token público (legacy + landing pública) ----------
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
