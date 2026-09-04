// deno-lint-ignore-file no-explicit-any
/**
 * Resumen semanal de entrenamientos por email.
 *
 * Modos:
 *  - preview    : admin. Devuelve subject/html/entrenamientos sin enviar.
 *  - manual     : admin. Encola el envío para un alumno y una semana puntual.
 *  - automatico : cron dominical. Recorre alumnos con la preferencia activa y
 *                 envía la SEMANA SIGUIENTE (lunes→domingo, Argentina).
 *
 * Fuente de entrenamientos: RPC `get_entrenamientos_semana_alumno`, que aplica
 * exactamente la misma regla de asignación que el dashboard del alumno.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Reybaud Ciclismo";
const APP_URL = "https://reybaud-app.com";
const BRAND = "#FF6B1A";
const TEMPLATE = "weekly_training_digest";

const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

const toISO = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

function arTodayISO(now = new Date()): string {
  return toISO(new Date(now.getTime() - AR_OFFSET_MS));
}

function weekRange(baseISO: string, offset = 0) {
  const [y, m, d] = baseISO.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dow = base.getUTCDay();
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    dates.push(toISO(day));
  }
  return { inicio: dates[0], fin: dates[6], dates };
}

function weekLabel(inicio: string, fin: string) {
  const [, m1, d1] = inicio.split("-");
  const [, m2, d2] = fin.split("-");
  const mes1 = MESES[Number(m1) - 1];
  const mes2 = MESES[Number(m2) - 1];
  return mes1 === mes2
    ? `${Number(d1)} al ${Number(d2)} de ${mes2}`
    : `${Number(d1)} de ${mes1} al ${Number(d2)} de ${mes2}`;
}

const isValidEmail = (e?: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

interface Training {
  id: string; fecha: string; titulo: string | null; descripcion: string | null;
  tipo: string | null; grupo: string | null; link_archivo: string | null;
  resistencia: string | null; tecnica: string | null; intensidad: string | null;
}

function buildEmail(nombre: string, range: { inicio: string; fin: string; dates: string[] }, trainings: Training[]) {
  const label = weekLabel(range.inicio, range.fin);
  const subject = `Tus entrenamientos de la semana (${label})`;
  const byDate = new Map(trainings.map((t) => [t.fecha, t]));

  const rows = range.dates.map((date, i) => {
    const t = byDate.get(date);
    const [, mm, dd] = date.split("-");
    const head = `${DIAS[i]} ${Number(dd)}/${mm}`;
    if (!t) {
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #eee;">
        <div style="font-weight:700;color:#111;">${head}</div>
        <div style="color:#777;font-size:14px;">Descanso</div></td></tr>`;
    }
    const detalles: string[] = [];
    if (t.tipo) detalles.push(`Tipo: ${esc(t.tipo)}`);
    if (t.resistencia) detalles.push(`Resistencia: ${esc(t.resistencia)}`);
    if (t.tecnica) detalles.push(`Técnica: ${esc(t.tecnica)}`);
    if (t.intensidad) detalles.push(`Intensidad: ${esc(t.intensidad)}`);
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #eee;">
      <div style="font-weight:700;color:#111;">${head}</div>
      <div style="color:${BRAND};font-weight:600;font-size:15px;">${esc(t.titulo || "Entrenamiento")}</div>
      ${t.descripcion ? `<div style="color:#333;font-size:14px;white-space:pre-wrap;margin-top:4px;">${esc(t.descripcion)}</div>` : ""}
      ${detalles.length ? `<div style="color:#666;font-size:13px;margin-top:6px;">${detalles.join(" · ")}</div>` : ""}
      ${t.link_archivo ? `<div style="margin-top:6px;"><a href="${esc(t.link_archivo)}" style="color:${BRAND};font-size:13px;">Ver archivo adjunto</a></div>` : ""}
    </td></tr>`;
  }).join("");

  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <h1 style="font-size:20px;color:#111;margin:0 0 4px;">Hola ${esc(nombre)}</h1>
    <p style="color:#555;font-size:15px;margin:0 0 16px;">Estos son tus entrenamientos del ${esc(label)}.</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="margin:24px 0 0;"><a href="${APP_URL}" style="background:${BRAND};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;display:inline-block;">Ver en la app</a></p>
    <p style="color:#999;font-size:12px;margin-top:20px;">Reybaud Ciclismo</p>
  </div></body></html>`;

  const text = `Hola ${nombre}. Tus entrenamientos del ${label}:\n` +
    range.dates.map((date, i) => {
      const t = byDate.get(date);
      const [, mm, dd] = date.split("-");
      return `${DIAS[i]} ${Number(dd)}/${mm}: ${t ? `${t.titulo || "Entrenamiento"}${t.descripcion ? " - " + t.descripcion : ""}` : "Descanso"}`;
    }).join("\n");

  return { subject, html, text };
}

async function getUnsubToken(sb: any, email: string): Promise<string> {
  const e = email.trim().toLowerCase();
  const { data: ex } = await sb.from("email_unsubscribe_tokens").select("token").eq("email", e).maybeSingle();
  if (ex?.token) return ex.token;
  const t = crypto.randomUUID();
  const { data: ins } = await sb.from("email_unsubscribe_tokens").insert({ email: e, token: t }).select("token").maybeSingle();
  if (ins?.token) return ins.token;
  const { data: fb } = await sb.from("email_unsubscribe_tokens").select("token").eq("email", e).maybeSingle();
  if (fb?.token) return fb.token;
  throw new Error("unsubscribe_token_error");
}

async function fetchTrainings(sb: any, alumnoId: string, desde: string, hasta: string): Promise<Training[]> {
  const { data, error } = await sb.rpc("get_entrenamientos_semana_alumno", {
    _alumno_id: alumnoId, _desde: desde, _hasta: hasta,
  });
  if (error) throw error;
  return (data || []) as Training[];
}

async function sendForAlumno(
  sb: any,
  alumno: any,
  range: { inicio: string; fin: string; dates: string[] },
  modo: "manual" | "automatico",
  enviadoPor: string | null
) {
  if (!isValidEmail(alumno.email)) return { skipped: "email_invalido" };

  const trainings = await fetchTrainings(sb, alumno.id, range.inicio, range.fin);
  if (trainings.length === 0) return { skipped: "sin_entrenamientos" };

  const { subject, html, text } = buildEmail(alumno.nombre || "ciclista", range, trainings);
  const messageId = crypto.randomUUID();

  // Idempotencia: para automático, una sola fila 'queued' por alumno+semana.
  const { error: logErr } = await sb.from("weekly_training_email_sends").insert({
    alumno_id: alumno.id,
    semana_inicio: range.inicio,
    semana_fin: range.fin,
    modo,
    status: "queued",
    message_id: messageId,
    subject,
    recipient_email: alumno.email,
    entrenamientos_count: trainings.length,
    grupo: alumno.grupo,
    enviado_por: enviadoPor,
  });
  if (logErr) {
    if ((logErr as any).code === "23505") return { skipped: "ya_enviado" };
    throw logErr;
  }

  try {
    const unsub = await getUnsubToken(sb, alumno.email);
    const { error } = await sb.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: alumno.email,
        from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject, html, text,
        purpose: "transactional",
        label: TEMPLATE,
        idempotency_key: `${TEMPLATE}-${alumno.id}-${range.inicio}-${modo}-${messageId.slice(0, 8)}`,
        queued_at: new Date().toISOString(),
        unsubscribe_token: unsub,
      },
    });
    if (error) throw error;
  } catch (e) {
    await sb.from("weekly_training_email_sends")
      .update({ status: "failed", error_message: e instanceof Error ? e.message : String(e) })
      .eq("message_id", messageId);
    throw e;
  }

  return { sent: true, count: trainings.length, subject };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const mode: string = body.mode || "automatico";

    /* ---------- Automático (cron dominical 18:00 AR = 21:00 UTC) ---------- */
    if (mode === "automatico") {
      const range = weekRange(arTodayISO(), 1);
      const { data: alumnos, error } = await sb
        .from("alumnos")
        .select("id, nombre, email, grupo, estado")
        .eq("recibe_entrenamientos_email", true)
        .eq("estado", "activo");
      if (error) throw error;

      let sent = 0; const skipped: Record<string, number> = {}; const errors: string[] = [];
      for (const a of alumnos || []) {
        try {
          const r: any = await sendForAlumno(sb, a, range, "automatico", null);
          if (r.sent) sent++;
          else skipped[r.skipped] = (skipped[r.skipped] || 0) + 1;
        } catch (e) {
          errors.push(`${a.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return json({ ok: true, mode, semana: range, candidatos: (alumnos || []).length, sent, skipped, errors });
    }

    /* ---------- Manual / preview: sólo admin ---------- */
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    const userId = claims?.claims?.sub;
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return json({ error: "Only admin" }, 403);

    const alumnoId: string = body.alumno_id;
    if (!alumnoId) return json({ error: "alumno_id required" }, 400);

    const { data: alumno } = await sb
      .from("alumnos").select("id, nombre, email, grupo, estado").eq("id", alumnoId).maybeSingle();
    if (!alumno) return json({ error: "alumno_not_found" }, 404);

    const baseISO = arTodayISO();
    const range = body.semana_inicio
      ? weekRange(body.semana_inicio, 0)
      : weekRange(baseISO, body.offset === 1 ? 1 : 0);

    if (mode === "preview") {
      const trainings = await fetchTrainings(sb, alumno.id, range.inicio, range.fin);
      const { subject, html } = buildEmail(alumno.nombre || "ciclista", range, trainings);
      const { data: previos } = await sb
        .from("weekly_training_email_sends")
        .select("created_at, modo, status")
        .eq("alumno_id", alumno.id).eq("semana_inicio", range.inicio)
        .order("created_at", { ascending: false }).limit(1);
      return json({
        ok: true, semana: range, email: alumno.email, email_valido: isValidEmail(alumno.email),
        subject, html, entrenamientos: trainings, previo: previos?.[0] ?? null,
      });
    }

    if (mode === "manual") {
      const r: any = await sendForAlumno(sb, alumno, range, "manual", userId);
      if (r.skipped) return json({ ok: false, skipped: r.skipped, semana: range }, 200);
      return json({ ok: true, ...r, semana: range });
    }

    return json({ error: "invalid_mode" }, 400);
  } catch (e) {
    console.error("send-weekly-training-digest", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
