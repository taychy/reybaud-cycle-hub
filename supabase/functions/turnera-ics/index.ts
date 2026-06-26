// Public endpoint that returns an .ics file for a reservas_turnera row.
// Usage: GET /functions/v1/turnera-ics?id=<reservation_id>
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const pad = (n: number) => String(n).padStart(2, "0");

// Argentina is UTC-3 (no DST). We build the ICS in UTC by shifting +3h.
const toUtcStamp = (dateStr: string, timeStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss] = timeStr.split(":").map(Number);
  // local is AR (UTC-3) → utc = local + 3h
  const utc = new Date(Date.UTC(y, m - 1, d, hh + 3, mm, ss || 0));
  return `${utc.getUTCFullYear()}${pad(utc.getUTCMonth() + 1)}${pad(utc.getUTCDate())}T${pad(utc.getUTCHours())}${pad(utc.getUTCMinutes())}${pad(utc.getUTCSeconds())}Z`;
};

const escapeIcs = (s: string) =>
  String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return new Response("Missing id", { status: 400, headers: corsHeaders });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: r } = await supabase
      .from("reservas_turnera")
      .select("id, fecha, hora_inicio, hora_fin, nombre, apellido, email, servicio_id, estado_operativo")
      .eq("id", id)
      .maybeSingle();

    if (!r) return new Response("Not found", { status: 404, headers: corsHeaders });

    const { data: s } = await supabase
      .from("servicios_turnera")
      .select("nombre, descripcion, modalidad")
      .eq("id", r.servicio_id)
      .maybeSingle();

    const title = `${s?.nombre || "Reserva"} — Reybaud Ciclismo`;
    const desc = [s?.descripcion || "", `Reserva a nombre de ${r.nombre} ${r.apellido || ""}`].filter(Boolean).join("\\n\\n");
    const loc = s?.modalidad === "virtual" ? "Online" : "Reybaud Ciclismo";

    const dtStart = toUtcStamp(r.fecha as string, r.hora_inicio as string);
    const dtEnd = toUtcStamp(r.fecha as string, r.hora_fin as string);
    const dtStamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const status = r.estado_operativo === "cancelada" ? "CANCELLED" : "CONFIRMED";

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Reybaud//Turnera//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:turnera-${r.id}@reybaud-app.com`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcs(title)}`,
      `DESCRIPTION:${escapeIcs(desc)}`,
      `LOCATION:${escapeIcs(loc)}`,
      `STATUS:${status}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    return new Response(ics, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="reserva-${r.id}.ics"`,
      },
    });
  } catch (err) {
    return new Response(`Error: ${(err as Error).message}`, { status: 500, headers: corsHeaders });
  }
});
