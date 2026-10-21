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
    | "trip_save_step"
    | "trip_roommates_get"
    | "trip_roommates_invite"
    | "trip_roommates_respond"
    | "resolve_reservation_link";

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
  target_reservation_id?: string;
  roommate_id?: string;
  roommate_response?: "accept" | "reject";
};

const TOKEN_RE = /^[a-f0-9]{32,128}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


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

    // ---------- resolver reservation_id -> access_token (links legacy de mails) ----------
    // Sólo devuelve el token de una reserva existente y no cancelada. No expone PII.
    if (action === "resolve_reservation_link") {
      const rid = (body.reservation_id || "").trim();
      if (!UUID_RE.test(rid)) return json({ error: "invalid_reservation_id" }, 400);
      const { data, error } = await supabase
        .from("event_reservations")
        .select("id, access_token, reservation_status")
        .eq("id", rid)
        .maybeSingle();
      if (error) return json({ error: "lookup_failed" }, 500);
      if (!data) return json({ error: "not_found" }, 404);
      if (String(data.reservation_status || "").startsWith("cancel")) {
        return json({ error: "cancelled" }, 409);
      }
      if (!data.access_token) return json({ error: "no_token" }, 409);
      return json({ ok: true, token: data.access_token });
    }

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

    // ---------- acciones trip por token (ExternalTripView) ----------
    if (["trip_get","trip_save_step","trip_roommates_get","trip_roommates_invite","trip_roommates_respond"].includes(action)) {
      const t = (body.token || "").trim();
      if (!TOKEN_RE.test(t)) return json({ error: "invalid_token" }, 400);

      const { data: reservation, error: rErr } = await supabase
        .from("event_reservations")
        .select(
          "id, reservation_status, payment_status, amount_total, amount_paid, balance_due, moneda, currency_snapshot, external_participant_id, alumno_id, event_id, access_token, package_id, package_nombre_snapshot, genero_habitacion, external_email, external_first_name, external_last_name"
        )
        .eq("access_token", t)
        .maybeSingle();
      if (rErr) return json({ error: "lookup_failed", detail: rErr.message }, 500);
      if (!reservation) return json({ error: "not_found" }, 404);



      const resolveReservationParticipant = async (r: any) => {
        if (r.alumno_id) {
          const { data: a } = await supabase.from("alumnos").select("id,nombre,apellido,email").eq("id", r.alumno_id).maybeSingle();
          return a ? { alumno_id: a.id, nombre: `${a.nombre ?? ""} ${a.apellido ?? ""}`.trim() || a.email, email: a.email } : null;
        }
        if (r.external_participant_id) {
          const { data: e } = await supabase.from("event_external_participants").select("id,nombre,apellido,email").eq("id", r.external_participant_id).maybeSingle();
          return e ? { alumno_id: null, nombre: `${e.nombre ?? ""} ${e.apellido ?? ""}`.trim() || e.email, email: e.email } : null;
        }
        if (r.external_email) return { alumno_id: null, nombre: `${r.external_first_name ?? ""} ${r.external_last_name ?? ""}`.trim() || r.external_email, email: r.external_email };
        return null;
      };

      if (action === "trip_roommates_get") {
        const me = await resolveReservationParticipant(reservation);
        const { data: pkg } = reservation.package_id
          ? await supabase.from("event_packages").select("personas_por_habitacion").eq("id", reservation.package_id).maybeSingle()
          : { data: null as any };
        const capacity = pkg?.personas_por_habitacion ?? null;

        const { data: outgoing } = await supabase
          .from("reservation_roommates").select("*")
          .eq("reservation_id", reservation.id).order("posicion");

        let incoming: any[] = [];
        if (me?.email) {
          const { data } = await supabase
            .from("reservation_roommates").select("*")
            .eq("event_id", reservation.event_id)
            .ilike("email", me.email)
            .neq("reservation_id", reservation.id);
          incoming = data ?? [];
        }

        const { data: eventReservations } = await supabase
          .from("event_reservations")
          .select("id,alumno_id,external_participant_id,external_email,external_first_name,external_last_name,reservation_status")
          .eq("event_id", reservation.event_id)
          .not("reservation_status","in",'("cancelada","rechazada")');

        const participants: any[] = [];
        for (const r of eventReservations ?? []) {
          if (r.id === reservation.id) continue;
          const p = await resolveReservationParticipant(r);
          if (!p?.email) continue;
          participants.push({ reservation_id: r.id, alumno_id: p.alumno_id, nombre: p.nombre });
        }

        return json({ ok: true, capacity, outgoing: outgoing ?? [], incoming, participants });
      }

      if (action === "trip_roommates_invite") {
        const targetId = (body.target_reservation_id || "").trim();
        if (!UUID_RE.test(targetId)) return json({ error: "invalid_target" }, 400);

        const { data: pkg } = reservation.package_id
          ? await supabase.from("event_packages").select("personas_por_habitacion").eq("id", reservation.package_id).maybeSingle()
          : { data: null as any };
        const capacity = Number(pkg?.personas_por_habitacion ?? 0);
        if (capacity <= 1) return json({ error: "room_not_shareable" }, 409);

        const { data: existingRows } = await supabase
          .from("reservation_roommates").select("id,status,email")
          .eq("reservation_id", reservation.id);
        const activeCount = (existingRows ?? []).filter((x: any) => x.status !== "rejected").length;
        if (activeCount >= capacity - 1) return json({ error: "room_full" }, 409);

        const { data: target } = await supabase
          .from("event_reservations")
          .select("id,event_id,alumno_id,external_participant_id,external_email,external_first_name,external_last_name,reservation_status")
          .eq("id", targetId).maybeSingle();
        if (!target || target.event_id !== reservation.event_id || ["cancelada","rechazada"].includes(target.reservation_status)) {
          return json({ error: "target_not_available" }, 404);
        }
        const targetP = await resolveReservationParticipant(target);
        if (!targetP?.email) return json({ error: "target_no_email" }, 409);
        if ((existingRows ?? []).some((x: any) => (x.email || "").toLowerCase() === targetP.email.toLowerCase() && x.status !== "rejected")) {
          return json({ error: "already_invited" }, 409);
        }

        const nextPos = Math.max(0, ...(existingRows ?? []).map((x: any) => Number(x.posicion || 0))) + 1;
        const { data: inserted, error: insErr } = await supabase
          .from("reservation_roommates")
          .insert({
            reservation_id: reservation.id,
            event_id: reservation.event_id,
            posicion: nextPos,
            nombre: targetP.nombre,
            email: targetP.email,
            alumno_id: targetP.alumno_id,
            status: "pending",
            confirmado: false,
            invited_by_alumno_id: reservation.alumno_id,
          })
          .select("*").single();
        if (insErr || !inserted) return json({ error: "invite_failed", detail: insErr?.message }, 500);

        fetch(`${SUPABASE_URL}/functions/v1/send-roommate-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ kind: "invite", roommate_id: inserted.id }),
        }).catch(() => {});

        return json({ ok: true, roommate: inserted });
      }

      if (action === "trip_roommates_respond") {
        const roommateId = (body.roommate_id || "").trim();
        const response = body.roommate_response;
        if (!UUID_RE.test(roommateId) || !["accept","reject"].includes(response || "")) return json({ error: "invalid_response" }, 400);
        const me = await resolveReservationParticipant(reservation);
        if (!me?.email) return json({ error: "participant_no_email" }, 409);

        const { data: row } = await supabase.from("reservation_roommates").select("*").eq("id", roommateId).maybeSingle();
        if (!row || row.event_id !== reservation.event_id || (row.email || "").toLowerCase() !== me.email.toLowerCase()) {
          return json({ error: "not_invited" }, 403);
        }

        if (response === "reject") {
          const { error } = await supabase.from("reservation_roommates").update({ status: "rejected", confirmado: false, updated_at: new Date().toISOString() }).eq("id", roommateId);
          if (error) return json({ error: "reject_failed", detail: error.message }, 500);
          return json({ ok: true });
        }

        const { data: inviterRes } = await supabase
          .from("event_reservations")
          .select("id,alumno_id,external_participant_id,external_email,external_first_name,external_last_name")
          .eq("id", row.reservation_id).maybeSingle();
        if (!inviterRes) return json({ error: "inviter_not_found" }, 404);
        const inviterP = await resolveReservationParticipant(inviterRes);

        const { error: accErr } = await supabase.from("reservation_roommates")
          .update({ status: "accepted", confirmado: true, updated_at: new Date().toISOString() }).eq("id", roommateId);
        if (accErr) return json({ error: "accept_failed", detail: accErr.message }, 500);

        if (inviterP?.email) {
          const { data: mirror } = await supabase.from("reservation_roommates")
            .select("id").eq("reservation_id", reservation.id).ilike("email", inviterP.email).maybeSingle();
          if (mirror?.id) {
            await supabase.from("reservation_roommates").update({ status:"accepted", confirmado:true, updated_at:new Date().toISOString() }).eq("id", mirror.id);
          } else {
            const { data: myRows } = await supabase.from("reservation_roommates").select("posicion").eq("reservation_id", reservation.id);
            const nextPos = Math.max(0, ...(myRows ?? []).map((x:any)=>Number(x.posicion||0))) + 1;
            await supabase.from("reservation_roommates").insert({
              reservation_id: reservation.id,
              event_id: reservation.event_id,
              posicion: nextPos,
              nombre: inviterP.nombre,
              email: inviterP.email,
              alumno_id: inviterP.alumno_id,
              status: "accepted",
              confirmado: true,
              invited_by_alumno_id: reservation.alumno_id,
            });
          }
        }

        fetch(`${SUPABASE_URL}/functions/v1/send-roommate-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ kind: "accepted", roommate_id: roommateId }),
        }).catch(() => {});

        return json({ ok: true });
      }

      if (action === "trip_get") {
        const [eventRes, partExtRes, partAluRes, clRes] = await Promise.all([
          supabase
            .from("events")
            .select("id, title, date, end_date, location, currency, metadata, image_url, duration_days, duration_nights")
            .eq("id", reservation.event_id)
            .maybeSingle(),
          reservation.external_participant_id
            ? supabase
                .from("event_external_participants")
                .select("id, nombre, apellido, email")
                .eq("id", reservation.external_participant_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          !reservation.external_participant_id && reservation.alumno_id
            ? supabase
                .from("alumnos")
                .select("id, nombre, apellido, email")
                .eq("id", reservation.alumno_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          supabase
            .from("reservation_checklist_data")
            .select("id, step_key, completed, needs_advice, data, file_url")
            .eq("reservation_id", reservation.id),
        ]);

        // Convertir file_url (path) a signed URL temporal (1h) para que el invitado
        // externo pueda visualizar sus propios archivos del bucket privado.
        const checklist = await Promise.all(
          (clRes.data ?? []).map(async (row: any) => {
            if (!row.file_url) return row;
            const raw: string = row.file_url;
            let path = raw;
            if (raw.startsWith("http://") || raw.startsWith("https://")) {
              const marker = "/trip-documents/";
              const idx = raw.indexOf(marker);
              if (idx < 0) return row;
              path = raw.slice(idx + marker.length);
              const q = path.indexOf("?");
              if (q >= 0) path = path.slice(0, q);
              try { path = decodeURIComponent(path); } catch { /* noop */ }
            }
            const { data: signed } = await supabase.storage
              .from("trip-documents")
              .createSignedUrl(path, 3600);
            return { ...row, file_url: signed?.signedUrl ?? null };
          })
        );

        // ── Paquete contratado + alojamiento asignado + compañeros ──
        let packageInfo: any = null;
        if (reservation.package_id) {
          const { data: pkg } = await supabase
            .from("event_packages")
            .select("id, nombre, descripcion, personas_por_habitacion, sin_alojamiento, incluye_gastronomia")
            .eq("id", reservation.package_id)
            .maybeSingle();
          packageInfo = pkg ?? null;
        }
        if (!packageInfo && reservation.package_nombre_snapshot) {
          packageInfo = { id: null, nombre: reservation.package_nombre_snapshot, descripcion: null, personas_por_habitacion: null, sin_alojamiento: null, incluye_gastronomia: null };
        }

        let lodging: any = null;
        const { data: myAssign } = await supabase
          .from("event_room_assignments")
          .select("room_id")
          .eq("reservation_id", reservation.id)
          .maybeSingle();
        if (myAssign?.room_id) {
          const [{ data: room }, { data: mates }] = await Promise.all([
            supabase.from("event_rooms").select("id, nombre, tipo, genero, capacidad").eq("id", myAssign.room_id).maybeSingle(),
            supabase.from("event_room_assignments").select("reservation_id").eq("room_id", myAssign.room_id),
          ]);
          const otherIds = (mates ?? []).map((m: any) => m.reservation_id).filter((rid: string) => rid !== reservation.id);
          let names: string[] = [];
          if (otherIds.length) {
            const { data: others } = await supabase
              .from("event_reservations")
              .select("id, alumno_id, external_first_name, external_last_name")
              .in("id", otherIds);
            const aluIds = (others ?? []).map((o: any) => o.alumno_id).filter(Boolean);
            let aluMap: Record<string, string> = {};
            if (aluIds.length) {
              const { data: alus } = await supabase.from("alumnos").select("id, nombre, apellido").in("id", aluIds);
              (alus ?? []).forEach((a: any) => { aluMap[a.id] = `${a.nombre ?? ""} ${a.apellido ?? ""}`.trim(); });
            }
            names = (others ?? []).map((o: any) =>
              (o.alumno_id && aluMap[o.alumno_id]) ||
              `${o.external_first_name ?? ""} ${o.external_last_name ?? ""}`.trim() ||
              "Participante"
            );
          }
          lodging = room ? { ...room, roommates: names } : null;
        }

        // Datos alimentarios previos del mismo participante (solo propios) para confirmar/actualizar.
        let foodHistory: any = null;
        if (reservation.alumno_id) {
          const { data: hist } = await supabase
            .from("reservation_checklist_data")
            .select("step_key, data, updated_at, reservation_id")
            .eq("alumno_id", reservation.alumno_id)
            .in("step_key", ["gastronomia", "alimentacion"])
            .neq("reservation_id", reservation.id)
            .order("updated_at", { ascending: false })
            .limit(1);
          const h = hist?.[0];
          if (h) foodHistory = { step_key: h.step_key, data: h.data, updated_at: h.updated_at };
        }

        return json({
          ok: true,
          food_history: foodHistory,
          reservation,
          event: eventRes.data ?? null,
          participant: partExtRes.data ?? partAluRes.data ?? null,
          checklist,
          package: packageInfo,
          lodging,
        });

      }

      // trip_save_step
      const stepKey = (body.step_key || "").trim();
      if (!stepKey || stepKey.length > 64) return json({ error: "invalid_step_key" }, 400);

      const fileUrl =
        typeof body.file_url === "string" && body.file_url.length <= 2000
          ? body.file_url
          : body.file_url === null
            ? null
            : null;
      const dataPayload =
        body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : {};

      // Upsert manual (no hay unique constraint conocida sobre reservation_id+step_key)
      const { data: existing } = await supabase
        .from("reservation_checklist_data")
        .select("id")
        .eq("reservation_id", reservation.id)
        .eq("step_key", stepKey)
        .maybeSingle();

      const payload = {
        reservation_id: reservation.id,
        alumno_id: reservation.alumno_id, // sólo se guarda alumno real (no string externo)
        step_key: stepKey,
        completed: !!body.completed,
        needs_advice: !!body.needs_advice,
        data: dataPayload,
        file_url: fileUrl,
      };

      if (existing?.id) {
        const { error: uErr } = await supabase
          .from("reservation_checklist_data")
          .update(payload)
          .eq("id", existing.id);
        if (uErr) return json({ error: "update_failed", detail: uErr.message }, uErr.message?.includes("reserva_no_activa") || uErr.message?.includes("_invalido") ? 400 : 500);
        return json({ ok: true, id: existing.id });
      }

      const { data: ins, error: iErr } = await supabase
        .from("reservation_checklist_data")
        .insert(payload)
        .select("id")
        .single();
      if (iErr) return json({ error: "insert_failed", detail: iErr.message }, iErr.message?.includes("reserva_no_activa") || iErr.message?.includes("_invalido") ? 400 : 500);
      return json({ ok: true, id: ins.id });
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
