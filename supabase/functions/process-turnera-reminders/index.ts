// Cron worker: scans reservas_turnera and triggers send-turnera-email when within the
// service's recordatorio window. Handles two independent reminders:
//   - alumno  (recordatorio)         → recordatorio_enviado_at
//   - coach   (coach_recordatorio)   → coach_recordatorio_enviado_at
// Called by pg_cron every 15 minutes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Reservation local AR time (UTC-3) → UTC
const toUtc = (fecha: string, hora: string) => {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, 0));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const ahead = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14); // up to 14 days ahead

  // Only active reservations ("reservada") are eligible for reminders.
  const { data: reservas, error } = await supabase
    .from("reservas_turnera")
    .select(
      "id, fecha, hora_inicio, servicio_id, coach_id, email, recordatorio_enviado_at, coach_recordatorio_enviado_at, estado_operativo, servicios_turnera!inner(email_recordatorio_enabled, recordatorio_horas_antes, email_coach_recordatorio_enabled, coach_recordatorio_horas_antes)",
    )
    .gte("fecha", now.toISOString().substring(0, 10))
    .lte("fecha", ahead.toISOString().substring(0, 10))
    .eq("estado_operativo", "reservada")
    .or("recordatorio_enviado_at.is.null,coach_recordatorio_enviado_at.is.null")
    .limit(500);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const send = async (reservation_id: string, tipo: string) => {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-turnera-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ reservation_id, tipo }),
    });
    return resp.ok;
  };

  const stats = {
    scanned: reservas?.length || 0,
    alumno_sent: 0, alumno_skipped: 0, alumno_failed: 0,
    coach_sent: 0, coach_skipped: 0, coach_failed: 0,
  };

  for (const r of (reservas || []) as any[]) {
    const cfg = r.servicios_turnera;
    if (!cfg) { stats.alumno_skipped++; stats.coach_skipped++; continue; }

    const reservaUtc = toUtc(r.fecha as string, r.hora_inicio as string);
    if (reservaUtc < now) { stats.alumno_skipped++; stats.coach_skipped++; continue; }

    const due = (hours: number) =>
      now >= new Date(reservaUtc.getTime() - hours * 60 * 60 * 1000);

    // ── Alumno ──
    if (!r.recordatorio_enviado_at) {
      if (cfg.email_recordatorio_enabled === false || !r.email) {
        stats.alumno_skipped++;
      } else if (!due(Number(cfg.recordatorio_horas_antes ?? 24))) {
        stats.alumno_skipped++;
      } else {
        try {
          (await send(r.id, "recordatorio")) ? stats.alumno_sent++ : stats.alumno_failed++;
        } catch { stats.alumno_failed++; }
      }
    }

    // ── Coach (independiente del alumno) ──
    if (!r.coach_recordatorio_enviado_at) {
      if (cfg.email_coach_recordatorio_enabled === false || !r.coach_id) {
        stats.coach_skipped++;
      } else if (!due(Number(cfg.coach_recordatorio_horas_antes ?? 24))) {
        stats.coach_skipped++;
      } else {
        try {
          (await send(r.id, "coach_recordatorio")) ? stats.coach_sent++ : stats.coach_failed++;
        } catch { stats.coach_failed++; }
      }
    }
  }

  return new Response(JSON.stringify(stats), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
