// Cron worker: scans reservas_turnera and triggers send-turnera-email when within the
// service's recordatorio_horas_antes window. Called by pg_cron every 15 minutes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const ahead = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14); // up to 14 days ahead

  // Pull upcoming reservations not yet reminded, joined with their service config
  const { data: reservas, error } = await supabase
    .from("reservas_turnera")
    .select("id, fecha, hora_inicio, servicio_id, recordatorio_enviado_at, estado_operativo, email, servicios_turnera!inner(email_recordatorio_enabled, recordatorio_horas_antes)")
    .gte("fecha", now.toISOString().substring(0, 10))
    .lte("fecha", ahead.toISOString().substring(0, 10))
    .is("recordatorio_enviado_at", null)
    .neq("estado_operativo", "cancelada")
    .limit(500);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let sent = 0, skipped = 0, failed = 0;
  for (const r of (reservas || []) as any[]) {
    const cfg = r.servicios_turnera;
    if (!cfg || cfg.email_recordatorio_enabled === false) { skipped++; continue; }
    if (!r.email) { skipped++; continue; }
    const hoursBefore = Number(cfg.recordatorio_horas_antes ?? 24);

    const [y, m, d] = (r.fecha as string).split("-").map(Number);
    const [hh, mm] = (r.hora_inicio as string).split(":").map(Number);
    // Reservation local AR time → UTC by +3h
    const reservaUtc = new Date(Date.UTC(y, m - 1, d, hh + 3, mm, 0));
    const reminderAt = new Date(reservaUtc.getTime() - hoursBefore * 60 * 60 * 1000);

    // Send if now >= reminderAt AND reservation still in future
    if (now < reminderAt) { skipped++; continue; }
    if (reservaUtc < now) { skipped++; continue; }

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-turnera-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ reservation_id: r.id, tipo: "recordatorio" }),
      });
      if (resp.ok) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return new Response(JSON.stringify({ scanned: reservas?.length || 0, sent, skipped, failed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
