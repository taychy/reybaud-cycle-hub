// Edge function: event-school-checkin
// Etapa 2B — Check-in del alumno logueado para eventos tipo escuela (record_hora).
// - Requiere JWT (alumno logueado).
// - Idempotente: si ya está checked_in, retorna ok sin volver a actualizar.
// - Valida que la reserva exista y pertenezca al alumno logueado (vía email).
// - Actualiza event_reservations.checkin_at y event_participants.{status,checked_in_at}.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Body = {
  reservation_id?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }

    // Validar JWT
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "unauthorized" }, 401);

    const userEmail = (claimsData.claims.email || "").toLowerCase();
    if (!userEmail) return json({ error: "no_email_in_token" }, 401);

    // Service role para escrituras / lecturas confiables
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json().catch(() => ({}))) as Body;
    const reservationId = (body.reservation_id || "").trim();
    if (!reservationId) return json({ error: "missing_reservation_id" }, 400);

    // 1) Buscar la reserva y validar ownership por alumno (email)
    const { data: reservation, error: rErr } = await admin
      .from("event_reservations")
      .select("id, event_id, alumno_id, checkin_at, event_participant_id, reservation_status")
      .eq("id", reservationId)
      .maybeSingle();
    if (rErr) return json({ error: "lookup_failed", detail: rErr.message }, 500);
    if (!reservation) return json({ error: "not_found" }, 404);
    if (!reservation.alumno_id) return json({ error: "not_owner" }, 403);

    const { data: alumno } = await admin
      .from("alumnos")
      .select("id, email")
      .eq("id", reservation.alumno_id)
      .maybeSingle();
    if (!alumno || (alumno.email || "").toLowerCase() !== userEmail) {
      return json({ error: "not_owner" }, 403);
    }

    if (["cancelada", "rechazada"].includes(reservation.reservation_status)) {
      return json({ error: "reservation_inactive" }, 409);
    }

    const nowIso = new Date().toISOString();

    // 2) Idempotencia: si ya tiene checkin_at, no volver a actualizar
    if (reservation.checkin_at) {
      // asegurar que el participant también esté checked_in (consistencia)
      if (reservation.event_participant_id) {
        await admin
          .from("event_participants")
          .update({ status: "checked_in", checked_in_at: reservation.checkin_at })
          .eq("id", reservation.event_participant_id)
          .is("checked_in_at", null);
      }
      return json({
        ok: true,
        already_checked_in: true,
        checkin_at: reservation.checkin_at,
        reservation_id: reservation.id,
        event_participant_id: reservation.event_participant_id,
      });
    }

    // 3) Actualizar reserva
    const { error: updReservErr } = await admin
      .from("event_reservations")
      .update({ checkin_at: nowIso })
      .eq("id", reservation.id);
    if (updReservErr) {
      return json({ error: "update_reservation_failed", detail: updReservErr.message }, 500);
    }

    // 4) Actualizar participant auxiliar (si existe)
    let participantId = reservation.event_participant_id as string | null;
    if (participantId) {
      await admin
        .from("event_participants")
        .update({ status: "checked_in", checked_in_at: nowIso })
        .eq("id", participantId);
    } else {
      // fallback: buscar por reservation o por evento+email
      const { data: byRes } = await admin
        .from("event_participants")
        .select("id")
        .eq("event_reservation_id", reservation.id)
        .maybeSingle();
      if (byRes) {
        participantId = byRes.id;
        await admin
          .from("event_participants")
          .update({ status: "checked_in", checked_in_at: nowIso })
          .eq("id", byRes.id);
        await admin
          .from("event_reservations")
          .update({ event_participant_id: byRes.id })
          .eq("id", reservation.id);
      }
    }

    return json({
      ok: true,
      checkin_at: nowIso,
      reservation_id: reservation.id,
      event_participant_id: participantId,
    });
  } catch (e: any) {
    console.error("event-school-checkin fatal", e);
    return json({ error: "unexpected", detail: e?.message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
