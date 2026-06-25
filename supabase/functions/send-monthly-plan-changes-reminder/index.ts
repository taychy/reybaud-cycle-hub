// Recordatorio mensual (día 25, 10:00 AR) para alumnos sobre cambios de plan, pausas y bajas.
// Disparado por pg_cron. También admite invocación manual con { dry_run, test_email }.
//
// Mejoras aplicadas:
//  1. Filtra alumnos pausados / vacaciones / bloqueados / cancelados.
//  2. Excluye direcciones en `suppressed_emails`.
//  3. Loguea cada envío en `email_send_log` (status sent/failed/suppressed).
//  4. Calcula deadline (día 28) y etiqueta en timezone Argentina (America/Argentina/Buenos_Aires).
//  5. Throttle suave (~120/min) para no saturar Brevo.
//  6. test_email y dry_run no escriben en email_send_log (excepto marcado test).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/brevo";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = (Deno.env.get("PUBLIC_APP_URL")?.replace(/\/+$/, "") || "https://reybaud-app.com");

const AR_TZ = "America/Argentina/Buenos_Aires";
const DAYS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MONTHS_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

// Devuelve {y,m,d} en zona horaria AR
function arParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: AR_TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const y = parseInt(get("year"), 10);
  const m = parseInt(get("month"), 10);
  const day = parseInt(get("day"), 10);
  return { y, m, d: day };
}

function formatDeadlineAR(y: number, m: number, d: number) {
  // Construyo Date a mediodía UTC para que el día de la semana sea estable en AR.
  const probe = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  const weekday = new Intl.DateTimeFormat("es-AR", { timeZone: AR_TZ, weekday: "long" }).format(probe);
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${cap} ${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${String(y).slice(-2)}`;
}

function buildHtml(opts: { nombre: string; deadline: string; nextMonth: string; appUrl: string; hasDebt: boolean }) {
  const { nombre, deadline, nextMonth, appUrl, hasDebt } = opts;
  const btn = (href: string, label: string, color: string) => `
    <a href="${href}" style="display:inline-block;background:${color};color:#ffffff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;font-size:14px;margin:6px 4px;">${label}</a>`;

  const payLabel = hasDebt ? "💳 Pagar mensualidad pendiente" : "💳 Pagar próxima mensualidad";
  const payColor = hasDebt ? "#d97706" : "#16a34a";
  const debtNotice = hasDebt
    ? `<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:12px 14px;margin:14px 0;color:#9a3412;font-size:14px;line-height:1.55;">
         <strong>⚠️ Tenés una mensualidad pendiente de pago.</strong> Al tocar el botón vas a regularizar el período adeudado, no el próximo.
       </div>`
    : "";

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/></head>
<body style="background:#ffffff;font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:0;">
  <div style="max-width:560px;margin:0 auto;padding:28px 22px;">
    <h1 style="font-family:'Oswald',Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;color:#1a1a1a;font-size:22px;margin:0 0 6px;">📢 Cambios de plan, pausas y bajas</h1>
    <p style="color:#666;font-size:13px;margin:0 0 22px;">${nextMonth}</p>

    <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">Hola <strong>${nombre}</strong>,</p>

    <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">
      Te recordamos que si querés hacer alguna modificación en tu plan
      (<strong>cambio de plan, pausa o baja</strong>), tenés tiempo hasta el
      <strong>${deadline}</strong>. Esto nos ayuda a organizar todo y asegurar
      que tu facturación se realice correctamente.
    </p>

    ${debtNotice}

    <div style="background:#f6f7f9;border-radius:10px;padding:14px 16px;margin:18px 0;">
      <p style="margin:0 0 6px;font-weight:700;font-size:14px;">📱 Sobre los pagos</p>
      <p style="margin:0;font-size:14px;line-height:1.55;color:#444;">
        Si ya pagaste con la App, te pedimos que vuelvas a realizar el pago mensual por ese mismo medio.
        Además, para tu comodidad, podés dejar activada la <strong>renovación automática</strong>
        y olvidarte del trámite mes a mes.
      </p>
    </div>

    <p style="font-size:14px;font-weight:700;margin:24px 0 8px;">Elegí qué querés hacer:</p>
    <div style="text-align:center;margin:6px 0 18px;">
      ${btn(`${appUrl}/alumno/pagos?action=cambiar-plan`, "🔁 Cambiar mi plan", "#E8832A")}
      ${btn(`${appUrl}/alumno/pagos?action=baja`, "✖️ Dar de baja", "#444444")}
    </div>

    <div style="text-align:center;margin:18px 0 6px;">
      ${btn(`${appUrl}/alumno/pagos`, payLabel, payColor)}
    </div>

    <p style="font-size:12px;color:#999;margin:26px 0 0;text-align:center;border-top:1px solid #eee;padding-top:14px;">
      ${hasDebt
        ? "Este recordatorio también está disponible por si necesitás gestionar algún cambio, pausa o baja.<br/><br/>Para continuar con normalidad, podés ponerte al día con la mensualidad pendiente desde el botón de arriba."
        : "Si no querés hacer ningún cambio, ignorá este mensaje. Tu plan continúa normalmente."}
    </p>
  </div>
</body></html>`;
}

async function sendOne(payload: any) {
  const resp = await fetch(`${GATEWAY_URL}/smtp/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": BREVO_API_KEY!,
    },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  const messageId = json?.messageId || (Array.isArray(json?.messageIds) ? json.messageIds[0] : null) || null;
  return { ok: resp.ok && !!messageId, status: resp.status, body: json ?? text, messageId };
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!LOVABLE_API_KEY || !BREVO_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY or BREVO_API_KEY" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const dryRun: boolean = !!body.dry_run;
  const testEmail: string | undefined = body.test_email?.toLowerCase().trim();
  const testHasDebt: boolean = !!body.test_has_debt;

  // Deadline: día 28 del mes en curso en AR.
  const now = new Date();
  const { y, m } = arParts(now);
  const deadlineText = formatDeadlineAR(y, m, 28);
  const nextMonthIdx = m % 12; // 0..11
  const nextMonthYear = m === 12 ? y + 1 : y;
  const nextMonth = `${MONTHS_ES[nextMonthIdx]} ${nextMonthYear}`;

  // Sender
  const { data: cfg } = await admin.from("broadcast_sender_config").select("*").limit(1).maybeSingle();
  const senderEmail = cfg?.sender_email || "news@reybaud-app.com";
  const senderName = cfg?.sender_name || "Ciclismo Reybaud";

  // Recipients
  let recipients: { email: string; nombre: string; alumno_id?: string }[] = [];
  if (testEmail) {
    recipients = [{ email: testEmail, nombre: "Alumno (prueba)" }];
  } else {
    // Sólo alumnos plenamente activos: excluye pausa, vacaciones, bloqueado, cancelado, inactivo, baja, pendiente.
    const { data, error } = await admin
      .from("alumnos")
      .select("id, email, nombre, estado")
      .eq("estado", "activo");
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const seen = new Set<string>();
    recipients = (data || [])
      .filter((a: any) => a.email && /.+@.+\..+/.test(a.email))
      .map((a: any) => ({ email: a.email.toLowerCase().trim(), nombre: a.nombre || "Alumno", alumno_id: a.id }))
      .filter((r) => { if (seen.has(r.email)) return false; seen.add(r.email); return true; });

    // Filtrar suppressed
    if (recipients.length > 0) {
      const emails = recipients.map(r => r.email);
      const { data: supp } = await admin
        .from("suppressed_emails")
        .select("email")
        .in("email", emails);
      const suppSet = new Set((supp || []).map((s: any) => s.email.toLowerCase()));
      if (suppSet.size > 0) {
        recipients = recipients.filter(r => !suppSet.has(r.email));
      }
    }
  }

  // Mapa de alumnos con deuda: sub 'vencida' o 'activa' con fecha_fin < hoy
  const debtSet = new Set<string>();
  if (!testEmail && recipients.length > 0) {
    const ids = recipients.map(r => r.alumno_id).filter(Boolean) as string[];
    const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: AR_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const { data: subs } = await admin
      .from("suscripciones")
      .select("alumno_id, estado, fecha_fin")
      .in("alumno_id", ids)
      .in("estado", ["vencida", "activa", "pendiente"]);
    for (const s of (subs || []) as any[]) {
      if (s.estado === "vencida") { debtSet.add(s.alumno_id); continue; }
      if ((s.estado === "activa" || s.estado === "pendiente") && s.fecha_fin && s.fecha_fin < todayISO) {
        debtSet.add(s.alumno_id);
      }
    }
  }


  const subject = `📢 Cambios de plan, pausas y bajas — vencen el ${deadlineText}`;

  if (dryRun) {
    return new Response(JSON.stringify({
      ok: true, dry_run: true, total: recipients.length, sample: recipients.slice(0, 5), subject, deadlineText, nextMonth,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const templateName = "monthly-plan-changes-reminder";
  const runTag = `${y}-${String(m).padStart(2,"0")}`;

  let sent = 0, failed = 0;
  for (const r of recipients) {
    const hasDebt = testEmail ? testHasDebt : !!(r.alumno_id && debtSet.has(r.alumno_id));
    const html = buildHtml({ nombre: r.nombre, deadline: deadlineText, nextMonth, appUrl: APP_URL, hasDebt });
    const payload = {
      sender: { email: senderEmail, name: senderName },
      to: [{ email: r.email, name: r.nombre }],
      subject,
      htmlContent: html,
      tags: ["monthly-plan-reminder", `month-${runTag}`, ...(testEmail ? ["test"] : [])],
    };
    const res = await sendOne(payload);
    if (res.ok) sent++; else failed++;

    // Log siempre (incluye envíos de prueba para trazabilidad)
    try {
      await admin.from("email_send_log").insert({
        recipient_email: r.email,
        template_name: templateName,
        status: res.ok ? "sent" : "failed",
        message_id: res.messageId,
        error_message: res.ok ? null : (typeof res.body === "string" ? res.body : JSON.stringify(res.body))?.slice(0, 1000),
      });
    } catch (_) { /* no romper el batch por logging */ }

    // Throttle ~120/min (500ms entre envíos). Sin delay en test.
    if (!testEmail) await sleep(500);
  }

  return new Response(JSON.stringify({
    ok: true, total: recipients.length, sent, failed, deadlineText, nextMonth, test: !!testEmail,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
