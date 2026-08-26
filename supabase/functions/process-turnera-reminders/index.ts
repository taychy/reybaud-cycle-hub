// Cron worker: scans reservas_turnera and triggers reminders when within the
// service's configured window. Handles FOUR independent notifications, one row
// each in turnera_notificaciones (reserva + tipo + canal):
//   - alumno  email     (recordatorio / email)
//   - alumno  whatsapp  (recordatorio / whatsapp)
//   - coach   email     (coach_recordatorio / email)
//   - coach   whatsapp  (coach_recordatorio / whatsapp)
// WhatsApp NEVER blocks email and never blocks the reservation.
// Called by pg_cron every 15 minutes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getWhatsappConfig, normalizePhoneWA, sendWhatsappTemplate, type WaTipo } from "../_shared/turneraWhatsapp.ts";
import { claimNotification, markNotification, skipNotification } from "../_shared/turneraNotifLog.ts";

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

const fmtFechaAR = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
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
      "id, fecha, hora_inicio, servicio_id, coach_id, nombre, apellido, email, celular, recordatorio_enviado_at, coach_recordatorio_enviado_at, estado_operativo, servicios_turnera!inner(nombre, email_recordatorio_enabled, recordatorio_horas_antes, email_coach_recordatorio_enabled, coach_recordatorio_horas_antes, whatsapp_recordatorio_enabled, whatsapp_coach_recordatorio_enabled)",
    )
    .gte("fecha", now.toISOString().substring(0, 10))
    .lte("fecha", ahead.toISOString().substring(0, 10))
    .eq("estado_operativo", "reservada")
    .limit(500);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sendEmail = async (reservation_id: string, tipo: string) => {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-turnera-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ reservation_id, tipo }),
    });
    const json = await resp.json().catch(() => ({}));
    return { ok: resp.ok, messageId: (json?.message_id as string) ?? null, detail: JSON.stringify(json).slice(0, 400) };
  };

  // Config de WhatsApp por tipo (una sola resolución por ciclo).
  const waCfg: Record<WaTipo, Awaited<ReturnType<typeof getWhatsappConfig>>> = {
    recordatorio: await getWhatsappConfig(supabase, "recordatorio"),
    coach_recordatorio: await getWhatsappConfig(supabase, "coach_recordatorio"),
  };

  const coachCache = new Map<string, { nombre: string; whatsapp: string | null }>();
  const getCoach = async (id: string) => {
    if (!coachCache.has(id)) {
      const { data } = await supabase.from("coaches").select("nombre, whatsapp").eq("id", id).maybeSingle();
      coachCache.set(id, { nombre: data?.nombre || "", whatsapp: (data as any)?.whatsapp || null });
    }
    return coachCache.get(id)!;
  };

  const stats = {
    scanned: reservas?.length || 0,
    email_sent: 0, email_skipped: 0, email_failed: 0,
    wa_queued: 0, wa_skipped: 0, wa_failed: 0,
    wa_configurado: {
      alumno: waCfg.recordatorio.configured,
      coach: waCfg.coach_recordatorio.configured,
    },
  };

  for (const r of (reservas || []) as any[]) {
    const cfg = r.servicios_turnera;
    if (!cfg) continue;

    const reservaUtc = toUtc(r.fecha as string, r.hora_inicio as string);
    if (reservaUtc < now) continue;

    const dueAt = (hours: number) => new Date(reservaUtc.getTime() - hours * 60 * 60 * 1000);
    const horasAlumno = Number(cfg.recordatorio_horas_antes ?? 24);
    const horasCoach = Number(cfg.coach_recordatorio_horas_antes ?? 24);

    // ── EMAIL alumno ──
    if (!r.recordatorio_enviado_at) {
      if (cfg.email_recordatorio_enabled === false || !r.email) {
        stats.email_skipped++;
      } else if (now < dueAt(horasAlumno)) {
        stats.email_skipped++;
      } else {
        try {
          const res = await sendEmail(r.id, "recordatorio");
          res.ok ? stats.email_sent++ : stats.email_failed++;
        } catch { stats.email_failed++; }
      }
    }

    // ── EMAIL coach (independiente) ──
    if (!r.coach_recordatorio_enviado_at) {
      if (cfg.email_coach_recordatorio_enabled === false || !r.coach_id) {
        stats.email_skipped++;
      } else if (now < dueAt(horasCoach)) {
        stats.email_skipped++;
      } else {
        try {
          const res = await sendEmail(r.id, "coach_recordatorio");
          res.ok ? stats.email_sent++ : stats.email_failed++;
        } catch { stats.email_failed++; }
      }
    }

    // ── WHATSAPP (alumno y coach, cada uno independiente del email) ──
    const alumnoNombre = String(r.nombre || "").trim() || "alumno";
    const horaTxt = String(r.hora_inicio || "").substring(0, 5);
    const fechaTxt = fmtFechaAR(r.fecha as string);
    const servicioNombre = cfg.nombre || "tu clase";

    const waTargets: Array<{ tipo: WaTipo; enabled: boolean; phoneRaw: string | null; horas: number; vars: Record<string, string> }> = [
      {
        tipo: "recordatorio",
        enabled: cfg.whatsapp_recordatorio_enabled === true,
        phoneRaw: r.celular,
        horas: horasAlumno,
        vars: { "1": alumnoNombre, "2": fechaTxt, "3": horaTxt, "4": servicioNombre },
      },
      {
        tipo: "coach_recordatorio",
        enabled: cfg.whatsapp_coach_recordatorio_enabled === true && !!r.coach_id,
        phoneRaw: null, // resuelto abajo
        horas: horasCoach,
        vars: { "1": "", "2": fechaTxt, "3": horaTxt, "4": `${alumnoNombre} ${r.apellido || ""}`.trim() },
      },
    ];

    for (const t of waTargets) {
      const canalCfg = waCfg[t.tipo];
      if (!t.enabled) {
        stats.wa_skipped++;
        continue; // canal apagado por servicio: no se registra ruido
      }
      if (!canalCfg.configured) {
        await skipNotification(supabase, {
          reservaId: r.id, tipo: t.tipo, canal: "whatsapp",
          motivo: `No configurado: falta ${canalCfg.missing.join(", ")}`,
        });
        stats.wa_skipped++;
        continue;
      }

      let phoneRaw = t.phoneRaw;
      if (t.tipo === "coach_recordatorio") {
        const coach = await getCoach(r.coach_id);
        phoneRaw = coach.whatsapp;
        t.vars["1"] = coach.nombre || "coach";
      }
      const phone = normalizePhoneWA(phoneRaw);
      if (!phone) {
        await skipNotification(supabase, {
          reservaId: r.id, tipo: t.tipo, canal: "whatsapp",
          motivo: "Sin número de WhatsApp válido",
        });
        stats.wa_skipped++;
        continue;
      }

      const scheduledFor = dueAt(t.horas).toISOString();
      let claim;
      try {
        claim = await claimNotification(supabase, {
          reservaId: r.id, tipo: t.tipo, canal: "whatsapp", destinatario: phone, scheduledFor,
        });
      } catch { stats.wa_failed++; continue; }

      if (!claim.claimed) { stats.wa_skipped++; continue; }
      if (now < dueAt(t.horas)) { stats.wa_skipped++; continue; } // queda "scheduled"

      try {
        const res = await sendWhatsappTemplate(canalCfg, phone, t.vars);
        if (res.ok) {
          await markNotification(supabase, claim.key, {
            estado: res.estado, provider: "twilio", provider_message_id: res.sid,
            metadata: { provider_status: res.providerStatus },
          });
          stats.wa_queued++;
        } else {
          await markNotification(supabase, claim.key, {
            estado: "error", provider: "twilio", error_code: res.code, error_message: res.message,
          });
          stats.wa_failed++;
        }
      } catch (e) {
        await markNotification(supabase, claim.key, {
          estado: "error", provider: "twilio", error_code: "exception", error_message: (e as Error).message.slice(0, 500),
        });
        stats.wa_failed++;
      }
    }
  }

  // ── Reconciliación de emails: queued → sent/error según email_send_log real ──
  try {
    const { data: pend } = await supabase
      .from("turnera_notificaciones")
      .select("idempotency_key, provider_message_id")
      .eq("canal", "email").eq("estado", "queued").not("provider_message_id", "is", null).limit(200);
    for (const p of (pend || []) as any[]) {
      const { data: log } = await supabase
        .from("email_send_log")
        .select("status, error_message")
        .eq("message_id", p.provider_message_id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!log) continue;
      if (log.status === "sent") {
        await markNotification(supabase, p.idempotency_key, { estado: "sent", provider: "lovable_email" });
      } else if (["failed", "dlq"].includes(String(log.status))) {
        await markNotification(supabase, p.idempotency_key, {
          estado: "error", provider: "lovable_email", error_code: String(log.status), error_message: log.error_message,
        });
      }
    }
  } catch (e) {
    console.error("[process-turnera-reminders] reconcile error:", (e as Error).message);
  }

  return new Response(JSON.stringify(stats), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
