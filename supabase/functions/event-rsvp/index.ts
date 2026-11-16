import { createClient } from "npm:@supabase/supabase-js@2";
import { sendManagedEmail } from "../_shared/send-managed-email.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const appUrl = (Deno.env.get("PUBLIC_APP_URL") || "https://reybaud-app.com").replace(/\/$/, "");
const db = createClient(url, key, { auth: { persistSession: false } });
const EVENT_ID = "08fc7e07-10df-4ace-b3ed-a0d581b6f7c9";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const cleanEmail = (x: string) => x.trim().toLowerCase();
const htmlEscape = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

async function requireAdmin(req: Request) {
  const header = req.headers.get("authorization") || "";
  const jwt = header.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new Error("Sesión requerida");
  const { data: { user }, error } = await db.auth.getUser(jwt);
  if (error || !user) throw new Error("Sesión inválida");
  const [{ data: userRoles }, { data: adminProfile }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "super_admin", "superadmin"]),
    db.from("admin_profiles").select("role").eq("user_id", user.id).maybeSingle(),
  ]);
  const validRoles = ["admin", "super_admin", "superadmin"];
  if (!(userRoles || []).some((r) => validRoles.includes(r.role)) &&
      !validRoles.includes(adminProfile?.role)) {
    throw new Error("Permisos de administración requeridos");
  }
  return user;
}

async function getEvent() {
  const { data: event, error } = await db.from("events")
    .select("id,title,date,location,metadata").eq("id", EVENT_ID).maybeSingle();
  if (error || !event || event.metadata?.rsvp_enabled !== true)
    throw new Error("Confirmación no disponible");
  return event;
}

async function upsertInvite(recipient: { email: string; name: string; alumno_id?: string | null }, isTest: boolean) {
  const email = cleanEmail(recipient.email);
  const { data, error } = await db.from("event_rsvp_invites").upsert({
    event_id: EVENT_ID,
    recipient_email: email,
    recipient_name: recipient.name,
    alumno_id: recipient.alumno_id || null,
    is_test: isTest,
  }, { onConflict: "event_id,recipient_email,is_test" })
    .select("id,token,recipient_email,recipient_name,response,last_sent_at").single();
  if (error || !data) throw error || new Error("No se creó invitación");
  return data;
}

function invitationHtml(name: string, token: string) {
  const join = appUrl + "/confirmar-asistencia/" + token + "?opcion=voy";
  const decline = appUrl + "/confirmar-asistencia/" + token + "?opcion=no_voy";
  const btn = (href: string, text: string, background: string, fg: string) =>
    '<a href="' + href + '" style="display:inline-block;padding:15px 30px;border-radius:9px;background:' +
    background + ';color:' + fg + ';text-decoration:none;font-weight:800;margin:6px">' + text + '</a>';
  return '<div style="max-width:600px;margin:auto;background:#0b1118;padding:32px 26px;color:#fff;font-family:Arial,sans-serif">' +
    '<div style="color:#ff7d16;font-size:15px;font-weight:800">CICLISMO REYBAUD</div>' +
    '<h1 style="font-size:31px;margin:16px 0 0">FONDAZO DE FIN DE AÑO</h1>' +
    '<p style="font-size:19px;color:#00c5f7">Domingo 29/11 · Capilla del Señor</p>' +
    '<p>Hola ' + htmlEscape(name) + '! Queremos despedir este 2026 juntos: fondo en ruta y parrilla después en La Carreta del Gato.</p>' +
    '<p>Para organizarnos, ¿contamos con vos?</p><div style="text-align:center;margin:24px 0">' +
    btn(join, "VOY", "#ff7d16", "#101010") + btn(decline, "NO VOY", "#182b38", "#fff") +
    '</div><p style="font-size:12px;color:#a9b5bc">Cada botón abre una confirmación segura sin iniciar sesión. Si venís, podrás elegir fondo, almuerzo o ambos.</p>' +
    '<p style="font-size:13px;color:#a9b5bc">Esta respuesta es preliminar y no constituye una reserva paga. Más adelante enviaremos otro mail con el alias del evento para abonar directamente y confirmar el almuerzo.</p>' +
    '<p style="font-size:13px;color:#a9b5bc">Horarios, recorridos y valores del almuerzo: información completa próximamente.</p></div>';
}

async function sendOne(recipient: { email: string; name: string; alumno_id?: string | null }, isTest: boolean) {
  const invite = await upsertInvite(recipient, isTest);
  if (invite.last_sent_at && !isTest) return "already_sent";
  const delivery = await sendManagedEmail({
    to: invite.recipient_email,
    fromName: "Ciclismo Reybaud",
    subject: "🚴 Fondazo de fin de año Reybaud | Confirmá si venís",
    html: invitationHtml(recipient.name, invite.token),
    text: "Fondazo de Fin de Año, domingo 29/11, Capilla del Señor. Voy: " +
      appUrl + "/confirmar-asistencia/" + invite.token + "?opcion=voy" +
      " | No voy: " + appUrl + "/confirmar-asistencia/" + invite.token + "?opcion=no_voy",
    label: isTest ? "event_rsvp_test" : "event_rsvp",
    idempotencyKey: "fondazo-rsvp-" + EVENT_ID + "-" + invite.recipient_email + (isTest ? "-test-" + crypto.randomUUID() : ""),
    supabase: db,
    redact: [invite.token],
  });
  if (!delivery.sent && delivery.reason !== "recipient_suppressed") throw new Error(delivery.error || "Falló el correo");
  if (!delivery.sent) return "suppressed";
  await db.from("event_rsvp_invites").update({ last_sent_at: new Date().toISOString() })
    .eq("id", invite.id);
  return "queued";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método inválido" }, 405);
  try {
    const body = await req.json();
    const action = String(body?.action || "");
    if (action === "status" || action === "respond") {
      const token = String(body?.token || "");
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(token)) return json({ error: "Enlace inválido" }, 400);
      const { data: invite } = await db.from("event_rsvp_invites")
        .select("id,event_id,recipient_name,response,participation_mode,guests_count")
        .eq("token", token).maybeSingle();
      if (!invite || invite.event_id !== EVENT_ID) return json({ error: "Enlace no encontrado" }, 404);
      const event = await getEvent();
      if (action === "status") return json({
        event: { title: event.title, date: event.date, location: event.location },
        name: invite.recipient_name, response: invite.response,
        participation_mode: invite.participation_mode, guests_count: invite.guests_count,
      });
      const response = String(body?.response || "");
      if (!["voy", "no_voy"].includes(response)) return json({ error: "Respuesta inválida" }, 400);
      const mode = response === "voy" ? String(body?.participation_mode || "") : "";
      if (response === "voy" && !["fondo_y_almuerzo", "solo_fondo", "solo_almuerzo"].includes(mode))
        return json({ error: "Elegí cómo vas a participar" }, 400);
      const guests = response === "voy" ? Number(body?.guests_count || 0) : 0;
      if (!Number.isInteger(guests) || guests < 0 || guests > 30)
        return json({ error: "Cantidad de acompañantes inválida" }, 400);
      const { error } = await db.from("event_rsvp_invites").update({
        response, participation_mode: mode || null, guests_count: guests,
        responded_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", invite.id);
      if (error) throw error;
      return json({ ok: true, response, participation_mode: mode || null, guests_count: guests });
    }
    const admin = await requireAdmin(req);
    const event = await getEvent();
    if (action === "summary") {
      const { data, error } = await db.from("event_rsvp_invites")
        .select("recipient_name,recipient_email,response,participation_mode,guests_count,responded_at,last_sent_at")
        .eq("event_id", EVENT_ID).eq("is_test", false)
        .order("recipient_name", { ascending: true });
      if (error) throw error;
      const rows = data || [];
      return json({
        event_title: event.title,
        invited: rows.filter((r) => r.last_sent_at).length,
        yes: rows.filter((r) => r.response === "voy").length,
        no: rows.filter((r) => r.response === "no_voy").length,
        pending: rows.filter((r) => r.last_sent_at && !r.response).length,
        fondo: rows.filter((r) => r.response === "voy" && r.participation_mode !== "solo_almuerzo").length,
        almuerzo: rows.filter((r) => r.response === "voy" && r.participation_mode !== "solo_fondo").length +
          rows.filter((r) => r.response === "voy" && r.participation_mode !== "solo_fondo")
            .reduce((n, r) => n + (r.guests_count || 0), 0),
        rows,
      });
    }
    if (action === "test_send") {
      const email = cleanEmail(String(body?.test_email || admin.email || ""));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return json({ error: "Email de prueba inválido" }, 400);
      const outcome = await sendOne({ email, name: "Prueba" }, true);
      if (outcome !== "queued") return json({ error: "El proveedor suprimió el correo de prueba" }, 409);
      return json({ ok: true, email, outcome });
    }
    if (action === "preview_count" || action === "send") {
      const { data, error } = await db.from("alumnos")
        .select("id,nombre,apellido,email,estado").eq("estado", "activo")
        .not("email", "is", null);
      if (error) throw error;
      const { data: suppressed } = await db.from("suppressed_emails").select("email");
      const exclusions = new Set((suppressed || []).map((r) => cleanEmail(r.email)));
      const unique = new Map<string, { email: string; name: string; alumno_id: string }>();
      for (const r of data || []) {
        const email = cleanEmail(r.email || "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || exclusions.has(email)) continue;
        if (!unique.has(email)) unique.set(email, { email, name: [r.nombre, r.apellido].filter(Boolean).join(" ").trim() || "Pelotón", alumno_id: r.id });
      }
      const recipients = Array.from(unique.values());
      if (action === "preview_count") return json({ eligible: recipients.length });
      if (body?.confirm_send !== true) return json({ error: "Falta confirmación expresa para envío general" }, 400);
      const { count: testCount } = await db.from("event_rsvp_invites")
        .select("id", { count: "exact", head: true }).eq("event_id", EVENT_ID)
        .eq("is_test", true).not("last_sent_at", "is", null);
      if (!testCount) return json({ error: "Primero enviá y verificá un correo de prueba" }, 400);
      let queued = 0, skipped = 0, failed = 0;
      for (let i = 0; i < recipients.length; i += 10) {
        const batch = await Promise.allSettled(recipients.slice(i, i + 10).map((r) => sendOne(r, false)));
        for (const b of batch) {
          if (b.status === "rejected") failed++;
          else if (b.value === "already_sent" || b.value === "suppressed") skipped++;
          else queued++;
        }
      }
      return json({ queued, skipped, failed, eligible: recipients.length });
    }
    return json({ error: "Acción desconocida" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const authError = /Sesión|Permisos/.test(msg);
    console.error("event-rsvp:", msg);
    return json({ error: authError ? "No autorizado" : msg }, authError ? 403 : 500);
  }
});
