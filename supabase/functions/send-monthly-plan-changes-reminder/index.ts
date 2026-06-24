// Recordatorio mensual automático (día 25) para alumnos activos
// sobre cambios de plan, pausas y bajas.
// Disparado por pg_cron. También aceptable invocación manual con { dry_run, test_email }.
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

const DAYS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MONTHS_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function formatDeadline(d: Date) {
  return `${DAYS_ES[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${String(d.getUTCFullYear()).slice(-2)}`;
}
function monthLabel(d: Date) {
  return `${MONTHS_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function buildHtml(opts: { nombre: string; deadline: string; nextMonth: string; appUrl: string }) {
  const { nombre, deadline, nextMonth, appUrl } = opts;
  const btn = (href: string, label: string, color: string) => `
    <a href="${href}" style="display:inline-block;background:${color};color:#ffffff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;font-size:14px;margin:6px 4px;">${label}</a>`;

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
      ${btn(`${appUrl}/alumno/pagos?action=pausa`, "⏸️ Pausar mi plan", "#1f6feb")}
      ${btn(`${appUrl}/alumno/pagos?action=baja`, "✖️ Dar de baja", "#444444")}
    </div>

    <div style="text-align:center;margin:18px 0 6px;">
      ${btn(`${appUrl}/alumno/pagos`, "💳 Ir a pagar / activar renovación", "#16a34a")}
    </div>

    <p style="font-size:12px;color:#999;margin:26px 0 0;text-align:center;border-top:1px solid #eee;padding-top:14px;">
      Si no querés hacer ningún cambio, ignorá este mensaje. Tu plan continúa normalmente.
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
  return { ok: resp.ok && !!(json?.messageId || json?.messageIds), status: resp.status, body: json ?? text };
}

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
  const testEmail: string | undefined = body.test_email;

  // Deadline: día 28 del mes en curso (Argentina, sin TZ exacta — suficiente para texto)
  const now = new Date();
  const deadline = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 28));
  const nextMonth = monthLabel(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()+1, 1)));
  const deadlineText = formatDeadline(deadline);

  // Sender
  const { data: cfg } = await admin.from("broadcast_sender_config").select("*").limit(1).maybeSingle();
  const senderEmail = cfg?.sender_email || "news@reybaud-app.com";
  const senderName = cfg?.sender_name || "Ciclismo Reybaud";

  // Recipients
  let recipients: { email: string; nombre: string }[] = [];
  if (testEmail) {
    recipients = [{ email: testEmail, nombre: "Alumno (prueba)" }];
  } else {
    const { data, error } = await admin
      .from("alumnos")
      .select("email, nombre, estado")
      .eq("estado", "activo");
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const seen = new Set<string>();
    recipients = (data || [])
      .filter((a: any) => a.email && /.+@.+\..+/.test(a.email))
      .map((a: any) => ({ email: a.email.toLowerCase().trim(), nombre: a.nombre || "Alumno" }))
      .filter((r) => { if (seen.has(r.email)) return false; seen.add(r.email); return true; });
  }

  const subject = `📢 Cambios de plan, pausas y bajas — vencen el ${deadlineText}`;

  if (dryRun) {
    return new Response(JSON.stringify({
      ok: true, dry_run: true, total: recipients.length, sample: recipients.slice(0, 5), subject, deadlineText, nextMonth,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let sent = 0, failed = 0;
  for (const r of recipients) {
    const html = buildHtml({ nombre: r.nombre, deadline: deadlineText, nextMonth, appUrl: APP_URL });
    const payload = {
      sender: { email: senderEmail, name: senderName },
      to: [{ email: r.email, name: r.nombre }],
      subject,
      htmlContent: html,
      tags: ["monthly-plan-reminder", `month-${now.getUTCFullYear()}-${now.getUTCMonth()+1}`],
    };
    const res = await sendOne(payload);
    if (res.ok) sent++; else failed++;
  }

  return new Response(JSON.stringify({ ok: true, total: recipients.length, sent, failed, deadlineText }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
