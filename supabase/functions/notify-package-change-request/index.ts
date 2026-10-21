import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendManagedEmail } from "../_shared/send-managed-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { request_id } = await req.json();
    if (!request_id) return json({ error: "missing_request_id" }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: changeReq, error } = await sb
      .from("event_package_change_requests")
      .select("id,reservation_id,event_id,package_actual_id,package_nuevo_id,estado,motivo_alumno,created_at")
      .eq("id", request_id)
      .maybeSingle();

    if (error || !changeReq) return json({ error: "request_not_found" }, 404);

    const [{ data: reservation }, { data: event }, { data: pkg }] = await Promise.all([
      sb.from("event_reservations")
        .select("id,alumno_id,external_participant_id,external_email,external_first_name,external_last_name")
        .eq("id", changeReq.reservation_id).maybeSingle(),
      sb.from("events").select("id,title").eq("id", changeReq.event_id).maybeSingle(),
      sb.from("event_packages").select("id,nombre").eq("id", changeReq.package_nuevo_id).maybeSingle(),
    ]);

    let participantName = "Participante";
    if (reservation?.alumno_id) {
      const { data: a } = await sb.from("alumnos").select("nombre,apellido").eq("id", reservation.alumno_id).maybeSingle();
      if (a) participantName = `${a.nombre ?? ""} ${a.apellido ?? ""}`.trim() || participantName;
    } else if (reservation?.external_participant_id) {
      const { data: e } = await sb.from("event_external_participants").select("nombre,apellido").eq("id", reservation.external_participant_id).maybeSingle();
      if (e) participantName = `${e.nombre ?? ""} ${e.apellido ?? ""}`.trim() || participantName;
    } else if (reservation) {
      participantName = `${reservation.external_first_name ?? ""} ${reservation.external_last_name ?? ""}`.trim() || participantName;
    }

    const availability = await sb.rpc("get_package_available_spots", { p_package_id: changeReq.package_nuevo_id });
    const available = Number(availability.data ?? 0);
    const noSpots = available <= 0;
    const adminUrl = `https://reybaud-app.com/admin/eventos/participantes?reservation=${changeReq.reservation_id}`;

    const subject = noSpots
      ? `Solicitud de habitación individual sin cupo — ${participantName}`
      : `Solicitud de cambio a habitación individual — ${participantName}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#111">
        <h2 style="margin-bottom:16px">${subject}</h2>
        <p><strong>Viaje:</strong> ${event?.title ?? ""}</p>
        <p><strong>Participante:</strong> ${participantName}</p>
        <p><strong>Paquete solicitado:</strong> ${pkg?.nombre ?? "Habitación individual"}</p>
        <p><strong>Disponibilidad actual:</strong> ${available > 0 ? available + " lugar(es)" : "Sin cupos"}</p>
        <p><strong>Motivo:</strong> ${changeReq.motivo_alumno ?? "—"}</p>
        <p style="margin-top:24px"><a href="${adminUrl}" style="background:#f97316;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">Ver reserva</a></p>
      </div>`;

    const result = await sendManagedEmail({
      to: "scarlett@ciclismoreybaud.com",
      subject,
      html,
      label: "package_change_request",
      idempotencyKey: `package-change-request:${changeReq.id}`,
      supabase: sb,
    });

    return json({ ok: true, sent: result.sent });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
