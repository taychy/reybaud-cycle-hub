// Edge function: register-record-participant
// Etapa 2A — Landing pública del Record
// Crea o reutiliza event_reservations como fuente principal de inscripción.
// Mantiene event_participants como auxiliar (token + resultado).
// verify_jwt = false (público)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Body = {
  first_name?: string;
  last_name?: string;
  email?: string;
  team_name?: string;
  event_id?: string | null;
  reservation_id?: string | null; // si la reserva ya existe (alumno logueado), reutilizar
  source?: "app" | "landing" | null; // hint del cliente; si hay JWT siempre se fuerza "app"
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

    // Detección de sesión autenticada (opcional)
    let authedEmail: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const userClient = createClient(SUPABASE_URL, ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const jwt = authHeader.replace("Bearer ", "");
        const { data: claimsData } = await userClient.auth.getClaims(jwt);
        if (claimsData?.claims?.email) {
          authedEmail = String(claimsData.claims.email).toLowerCase();
        }
      } catch (_) {
        // si falla el parseo del JWT, seguimos como anónimo
      }
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const first_name = (body.first_name || "").trim();
    const last_name = (body.last_name || "").trim();
    const email = ((body.email || authedEmail || "").trim()).toLowerCase();
    const team_name = (body.team_name || "").trim() || "Sin equipo";
    const isAuthed = !!authedEmail;
    const originValue = isAuthed ? "app" : "landing_publica";

    if (first_name.length < 2 || last_name.length < 2 || !isEmail(email)) {
      return json({ error: "invalid_input" }, 400);
    }

    // Si hay JWT y el email del cuerpo difiere del JWT, forzamos el del JWT por seguridad
    if (isAuthed && body.email && body.email.toLowerCase() !== authedEmail) {
      // ignoramos el body.email — ya usamos authedEmail arriba
    }

    // 1) Resolver evento Record activo
    let eventId = body.event_id || null;
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
      if (up) eventId = up.id;
      else {
        const { data: past } = await supabase
          .from("events")
          .select("id")
          .eq("type", "record_hora")
          .eq("is_active", true)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (past) eventId = past.id;
      }
    }
    if (!eventId) return json({ error: "no_active_event" }, 404);

    // 2) Buscar alumno por email
    const { data: alumno } = await supabase
      .from("alumnos")
      .select("id, nombre, apellido")
      .eq("email", email)
      .maybeSingle();

    let alumnoId: string | null = alumno?.id ?? null;
    let externalParticipantId: string | null = null;

    // 3) Si NO es alumno → buscar/crear external participant
    if (!alumnoId) {
      const { data: ext } = await supabase
        .from("event_external_participants")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (ext) {
        externalParticipantId = ext.id;
        // refrescar nombre/apellido si vinieron vacíos antes
        await supabase
          .from("event_external_participants")
          .update({ nombre: first_name, apellido: last_name })
          .eq("id", ext.id);
      } else {
        const { data: newExt, error: extErr } = await supabase
          .from("event_external_participants")
          .insert({
            email,
            nombre: first_name,
            apellido: last_name,
            estado: "activo",
          })
          .select("id")
          .single();
        if (extErr) {
          console.error("ext insert error", extErr);
          return json({ error: "external_create_failed" }, 500);
        }
        externalParticipantId = newExt.id;
      }
    }

    // 4) Buscar reservation: prioriza reservation_id explícito (alumno logueado),
    //    luego activa para (event_id, alumno_id) o (event_id, external_participant_id).
    let reservation: any = null;

    if (body.reservation_id) {
      const { data: r } = await supabase
        .from("event_reservations")
        .select("*")
        .eq("id", body.reservation_id)
        .maybeSingle();
      // Validar ownership: si hay alumno detectado, debe coincidir
      if (r && (!alumnoId || r.alumno_id === alumnoId)) {
        reservation = r;
      }
    }

    if (!reservation && alumnoId) {
      const { data: r } = await supabase
        .from("event_reservations")
        .select("*")
        .eq("event_id", eventId)
        .eq("alumno_id", alumnoId)
        .is("cancelled_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      reservation = r;
    } else if (!reservation && !alumnoId) {
      const { data: r } = await supabase
        .from("event_reservations")
        .select("*")
        .eq("event_id", eventId)
        .eq("external_participant_id", externalParticipantId)
        .is("cancelled_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      reservation = r;
    }

    // 5) Crear reservation si no existe
    if (!reservation) {
      const insertPayload: any = {
        event_id: eventId,
        origin: originValue,
        created_by: "cliente",
        reservation_status: "reserva_confirmada",
        payment_status: "no_aplica",
        accepted_terms: true,
      };
      if (alumnoId) {
        insertPayload.alumno_id = alumnoId;
      } else {
        insertPayload.external_participant_id = externalParticipantId;
        insertPayload.external_email = email;
        insertPayload.external_first_name = first_name;
        insertPayload.external_last_name = last_name;
        insertPayload.external_team_name = team_name;
      }
      const { data: newR, error: rErr } = await supabase
        .from("event_reservations")
        .insert(insertPayload)
        .select("*")
        .single();
      if (rErr) {
        console.error("reservation insert error", rErr);
        return json({ error: "reservation_create_failed", detail: rErr.message }, 500);
      }
      reservation = newR;
    }

    // 6) Buscar/crear event_participant auxiliar (token + resultado)
    let participant: any = null;

    // a) por event_reservation_id
    {
      const { data: p } = await supabase
        .from("event_participants")
        .select("*")
        .eq("event_reservation_id", reservation.id)
        .maybeSingle();
      if (p) participant = p;
    }

    // b) fallback por event_id + email
    if (!participant) {
      const { data: p } = await supabase
        .from("event_participants")
        .select("*")
        .eq("event_id", eventId)
        .ilike("email", email)
        .maybeSingle();
      if (p) {
        participant = p;
        // backfill el link a la reservation
        if (!p.event_reservation_id) {
          await supabase
            .from("event_participants")
            .update({ event_reservation_id: reservation.id })
            .eq("id", p.id);
        }
      }
    }

    // c) crear si no existe
    if (!participant) {
      const { data: newP, error: pErr } = await supabase
        .from("event_participants")
        .insert({
          event_slug: "record-de-la-hora",
          event_id: eventId,
          event_reservation_id: reservation.id,
          first_name,
          last_name,
          email,
          team_name,
          status: "registered",
          checked_in_at: null,
        })
        .select("*")
        .single();
      if (pErr) {
        console.error("participant insert error", pErr);
        return json({ error: "participant_create_failed", detail: pErr.message }, 500);
      }
      participant = newP;
    }

    // 7) Vincular event_participant_id en la reservation si falta
    if (!reservation.event_participant_id) {
      await supabase
        .from("event_reservations")
        .update({ event_participant_id: participant.id })
        .eq("id", reservation.id);
    }

    // 8) Disparar email de confirmación (fire & forget)
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-event-checkin-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          email,
          first_name,
          token: participant.public_access_token,
          reservation_id: reservation.id,
        }),
      });
    } catch (e) {
      console.warn("send-event-checkin-email failed (non-fatal)", e);
    }

    return json({
      ok: true,
      token: participant.public_access_token,
      reservation_id: reservation.id,
      participant_id: participant.id,
      event_id: eventId,
      reused: !!reservation.created_at && reservation.origin !== "landing_publica" ? false : undefined,
    });
  } catch (e: any) {
    console.error("register-record-participant fatal", e);
    return json({ error: "unexpected", detail: e?.message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
