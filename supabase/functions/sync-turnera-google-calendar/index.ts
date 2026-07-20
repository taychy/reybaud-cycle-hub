// Sincroniza reservas de turnera con Google Calendar compartido de la escuela.
// Se invoca desde el trigger `trg_sync_turnera_gcal`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CALENDAR_ID = "c_bb8012c231024152cdee4dd2209226311d060fae683d148210b0580cd23fcf54@group.calendar.google.com";
const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
const TZ = "America/Argentina/Buenos_Aires";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GOOGLE_CALENDAR_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const gcalHeaders = {
  "Authorization": `Bearer ${LOVABLE_API_KEY}`,
  "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
  "Content-Type": "application/json",
};

function buildEvent(r: any, servicio: any, coach: any, sede: any) {
  const start = `${r.fecha}T${r.hora_inicio}`;
  const end = `${r.fecha}T${r.hora_fin}`;
  const nombreAlumno = `${r.nombre ?? ""} ${r.apellido ?? ""}`.trim() || r.email || "Alumno";
  const servicioNombre = servicio?.nombre ?? "Turno";
  const coachNombre = coach?.nombre ?? coach?.full_name ?? "Coach";
  const sedeNombre = sede?.nombre ?? "";

  const summary = `${servicioNombre} — ${nombreAlumno}`;
  const descLines = [
    `Servicio: ${servicioNombre}`,
    `Alumno: ${nombreAlumno}`,
    r.email ? `Email: ${r.email}` : null,
    r.celular ? `Celular: ${r.celular}` : null,
    `Coach: ${coachNombre}`,
    sedeNombre ? `Sede: ${sedeNombre}` : null,
    r.nota ? `\nNota: ${r.nota}` : null,
    `\nReserva ID: ${r.id}`,
  ].filter(Boolean).join("\n");

  return {
    summary,
    description: descLines,
    location: sedeNombre || undefined,
    start: { dateTime: start, timeZone: TZ },
    end: { dateTime: end, timeZone: TZ },
    extendedProperties: {
      private: { reserva_turnera_id: r.id },
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { reservation_id, action } = await req.json();
    if (!reservation_id) {
      return new Response(JSON.stringify({ error: "reservation_id requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: r, error: rErr } = await supabase
      .from("reservas_turnera")
      .select("*")
      .eq("id", reservation_id)
      .single();
    if (rErr || !r) throw new Error(rErr?.message ?? "reserva no encontrada");

    // DELETE
    if (action === "delete") {
      if (r.google_event_id) {
        const delRes = await fetch(
          `${GATEWAY_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${r.google_event_id}`,
          { method: "DELETE", headers: gcalHeaders },
        );
        if (!delRes.ok && delRes.status !== 404 && delRes.status !== 410) {
          const body = await delRes.text();
          await supabase.from("reservas_turnera").update({
            google_sync_status: "error",
            google_sync_error: `delete ${delRes.status}: ${body.slice(0, 500)}`,
          }).eq("id", r.id);
          throw new Error(`gcal delete failed ${delRes.status}: ${body}`);
        }
        await supabase.from("reservas_turnera").update({
          google_event_id: null,
          google_sync_status: "deleted",
          google_sync_error: null,
          google_synced_at: new Date().toISOString(),
        }).eq("id", r.id);
      }
      return new Response(JSON.stringify({ ok: true, action: "delete" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UPSERT: obtener datos relacionados
    const [{ data: servicio }, { data: coach }, { data: sede }] = await Promise.all([
      r.servicio_id
        ? supabase.from("servicios_turnera").select("nombre").eq("id", r.servicio_id).maybeSingle()
        : Promise.resolve({ data: null }),
      r.coach_id
        ? supabase.from("coaches").select("nombre, email").eq("id", r.coach_id).maybeSingle()
        : Promise.resolve({ data: null }),
      r.sede_id
        ? supabase.from("sedes").select("nombre").eq("id", r.sede_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const coachFull = coach
      ? { nombre: coach.nombre ?? "", email: coach.email }
      : null;

    const eventPayload = buildEvent(r, servicio, coachFull, sede);

    let response: Response;
    if (r.google_event_id) {
      response = await fetch(
        `${GATEWAY_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${r.google_event_id}`,
        { method: "PATCH", headers: gcalHeaders, body: JSON.stringify(eventPayload) },
      );
      if (response.status === 404 || response.status === 410) {
        // Evento borrado en Google → recrear
        response = await fetch(
          `${GATEWAY_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
          { method: "POST", headers: gcalHeaders, body: JSON.stringify(eventPayload) },
        );
      }
    } else {
      response = await fetch(
        `${GATEWAY_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
        { method: "POST", headers: gcalHeaders, body: JSON.stringify(eventPayload) },
      );
    }

    if (!response.ok) {
      const body = await response.text();
      console.error(`gcal upsert failed [${response.status}]: ${body}`);
      await supabase.from("reservas_turnera").update({
        google_sync_status: "error",
        google_sync_error: `${response.status}: ${body.slice(0, 500)}`,
      }).eq("id", r.id);
      return new Response(JSON.stringify({ error: "gcal upsert failed", status: response.status, details: body }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    await supabase.from("reservas_turnera").update({
      google_event_id: data.id,
      google_sync_status: "synced",
      google_sync_error: null,
      google_synced_at: new Date().toISOString(),
    }).eq("id", r.id);

    return new Response(JSON.stringify({ ok: true, event_id: data.id, htmlLink: data.htmlLink }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sync-turnera-google-calendar error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
