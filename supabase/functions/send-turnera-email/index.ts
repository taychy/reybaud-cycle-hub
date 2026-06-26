// Sends turnera reservation emails: confirmación / recordatorio / cancelación.
// Reads service config (politica_cancelacion, ics_adjunto, email_*_enabled) from servicios_turnera.
// Logs every send to reservation_notifications (reusing the table; reservation_id stores reservas_turnera.id).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Reybaud Ciclismo";
const APP_DOMAIN = "https://reybaud-app.com";

type Tipo = "confirmacion" | "recordatorio" | "cancelacion" | "coach_aviso";

const normalizeEmail = (e: string) => e.trim().toLowerCase();

const getOrCreateUnsubscribeToken = async (supabase: any, email: string) => {
  const n = normalizeEmail(email);
  const { data: exist } = await supabase.from("email_unsubscribe_tokens").select("token").eq("email", n).maybeSingle();
  if (exist?.token) return exist.token;
  const token = crypto.randomUUID();
  const { data: ins } = await supabase.from("email_unsubscribe_tokens").insert({ email: n, token }).select("token").single();
  if (ins?.token) return ins.token;
  const { data: fb } = await supabase.from("email_unsubscribe_tokens").select("token").eq("email", n).maybeSingle();
  return fb?.token || token;
};

const escapeHtml = (s: string) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmtDateAR = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

const fmtHora = (t: string) => t.substring(0, 5);

const googleCalLink = (title: string, fecha: string, hi: string, hf: string, desc: string, loc: string) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [y, m, d] = fecha.split("-").map(Number);
  const [h1, m1] = hi.split(":").map(Number);
  const [h2, m2] = hf.split(":").map(Number);
  // AR = UTC-3 → UTC = local+3
  const start = `${y}${pad(m)}${pad(d)}T${pad(h1 + 3)}${pad(m1)}00Z`;
  const end = `${y}${pad(m)}${pad(d)}T${pad(h2 + 3)}${pad(m2)}00Z`;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
    details: desc,
    location: loc,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
};

const renderEmail = (opts: {
  tipo: Tipo;
  servicioNombre: string;
  nombre: string;
  fechaTxt: string;
  horaTxt: string;
  modalidad: string;
  politica: string;
  icsUrl: string | null;
  gcalUrl: string;
}) => {
  const { tipo, servicioNombre, nombre, fechaTxt, horaTxt, modalidad, politica, icsUrl, gcalUrl } = opts;
  const titulos: Record<Tipo, string> = {
    confirmacion: "✅ Tu reserva está confirmada",
    recordatorio: "⏰ Recordatorio de tu reserva",
    cancelacion: "❌ Tu reserva fue cancelada",
    coach_aviso: "📌 Nueva clase agendada en tu calendario",
  };
  const intros: Record<Tipo, string> = {
    confirmacion: "Recibimos tu reserva. Acá tenés los detalles:",
    recordatorio: "Te recordamos que tenés una reserva próxima:",
    cancelacion: "Te avisamos que tu reserva fue cancelada. Si fue un error, escribinos.",
    coach_aviso: "Un alumno reservó una clase con vos. Te dejamos los datos para que la sumes a tu calendario:",
  };
  const calBtn = tipo !== "cancelacion"
    ? `<div style="margin:20px 0;display:flex;gap:10px;flex-wrap:wrap;">
        <a href="${gcalUrl}" style="background:#0f1115;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;">📅 Agregar a Google Calendar</a>
        ${icsUrl ? `<a href="${icsUrl}" style="background:#fff;color:#0f1115;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;border:1px solid #0f1115;">⬇️ Descargar invitación (.ics)</a>` : ""}
      </div>`
    : "";
  const polBlock = politica && tipo !== "cancelacion"
    ? `<div style="border-top:1px solid #eee;margin-top:24px;padding-top:16px;">
         <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#0f1115;margin:0 0 8px;">Política de cancelación</h3>
         <div style="font-size:13px;color:#555;line-height:1.55;white-space:pre-line;">${escapeHtml(politica)}</div>
       </div>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:11px;letter-spacing:3px;color:#888;text-transform:uppercase;">Reybaud Ciclismo</span>
    </div>
    <h1 style="font-size:22px;color:#0f1115;margin:0 0 12px;">${titulos[tipo]}</h1>
    <p style="font-size:15px;color:#333;margin:0 0 20px;">Hola ${escapeHtml(nombre)}, ${intros[tipo]}</p>
    <div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:18px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:6px;">Servicio</div>
      <div style="font-size:16px;color:#0f1115;font-weight:600;margin-bottom:14px;">${escapeHtml(servicioNombre)}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:6px;">Fecha y hora</div>
      <div style="font-size:15px;color:#0f1115;margin-bottom:14px;">${escapeHtml(fechaTxt)} · ${escapeHtml(horaTxt)} hs</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:6px;">Modalidad</div>
      <div style="font-size:14px;color:#0f1115;">${escapeHtml(modalidad)}</div>
    </div>
    ${calBtn}
    ${polBlock}
    <p style="font-size:12px;color:#999;margin-top:32px;text-align:center;">Reybaud Ciclismo · <a href="${APP_DOMAIN}" style="color:#999;">reybaud-app.com</a></p>
  </div></body></html>`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { reservation_id, tipo } = await req.json() as { reservation_id: string; tipo: Tipo };
    if (!reservation_id || !tipo) {
      return new Response(JSON.stringify({ error: "Missing reservation_id or tipo" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: r, error: errR } = await supabase
      .from("reservas_turnera")
      .select("id, servicio_id, coach_id, alumno_id, fecha, hora_inicio, hora_fin, nombre, apellido, email, celular, documento, nota")
      .eq("id", reservation_id)
      .maybeSingle();
    if (errR || !r) return new Response(JSON.stringify({ error: "reservation_not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: s } = await supabase
      .from("servicios_turnera")
      .select("nombre, descripcion, modalidad, politica_cancelacion, email_confirmacion_enabled, email_recordatorio_enabled, email_coach_enabled, ics_adjunto, sedes:sede_id(nombre)")
      .eq("id", r.servicio_id)
      .maybeSingle();

    // Respect per-service toggles
    if (tipo === "confirmacion" && s && s.email_confirmacion_enabled === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "email_confirmacion_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (tipo === "recordatorio" && s && s.email_recordatorio_enabled === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "email_recordatorio_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (tipo === "coach_aviso" && s && s.email_coach_enabled === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "email_coach_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Resolve recipient
    let recipientEmail = r.email as string;
    let recipientName = r.nombre as string;
    if (tipo === "coach_aviso") {
      const { data: coach } = await supabase.from("coaches").select("email, nombre").eq("id", r.coach_id).maybeSingle();
      if (!coach?.email) {
        return new Response(JSON.stringify({ skipped: true, reason: "coach_no_email" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      recipientEmail = coach.email;
      recipientName = coach.nombre || "coach";
    }
    if (!recipientEmail) return new Response(JSON.stringify({ error: "no_email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const servicioNombre = s?.nombre || "Reserva";
    const modalidad = s?.modalidad === "virtual" ? "Online" : s?.modalidad === "hibrida" ? "Híbrida" : "Presencial — Reybaud Ciclismo";
    const fechaTxt = fmtDateAR(r.fecha as string);
    const horaTxt = `${fmtHora(r.hora_inicio as string)} – ${fmtHora(r.hora_fin as string)}`;
    const icsUrl = s?.ics_adjunto !== false
      ? `${SUPABASE_URL}/functions/v1/turnera-ics?id=${r.id}`
      : null;
    const gcal = googleCalLink(
      servicioNombre,
      r.fecha as string,
      r.hora_inicio as string,
      r.hora_fin as string,
      s?.descripcion || "",
      modalidad,
    );

    const html = renderEmail({
      tipo,
      servicioNombre,
      nombre: r.nombre,
      fechaTxt,
      horaTxt,
      modalidad,
      politica: s?.politica_cancelacion || "",
      icsUrl,
      gcalUrl: gcal,
    });

    const subjects: Record<Tipo, string> = {
      confirmacion: `Reserva confirmada · ${servicioNombre} · ${fechaTxt}`,
      recordatorio: `Recordatorio · ${servicioNombre} · ${fechaTxt}`,
      cancelacion: `Reserva cancelada · ${servicioNombre} · ${fechaTxt}`,
    };

    const messageId = crypto.randomUUID();
    const unsubscribeToken = await getOrCreateUnsubscribeToken(supabase, r.email);
    const idempotencyKey = `turnera-${tipo}-${r.id}`;

    const { error: qErr } = await supabase.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: r.email,
        from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: subjects[tipo],
        html,
        text: `${subjects[tipo]}\n\n${fechaTxt} ${horaTxt}\n\nVer detalles: ${APP_DOMAIN}`,
        purpose: "transactional",
        label: `turnera_${tipo}`,
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    });

    if (qErr) {
      return new Response(JSON.stringify({ error: "queue_failed", detail: qErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mark reminder as sent so cron doesn't re-send
    if (tipo === "recordatorio") {
      await supabase.from("reservas_turnera").update({ recordatorio_enviado_at: new Date().toISOString() } as any).eq("id", r.id);
    }

    return new Response(JSON.stringify({ success: true, tipo, recipient: r.email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
