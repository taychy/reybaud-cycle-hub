import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import { sendManagedEmail } from "../_shared/send-managed-email.ts";

const BodySchema = z.object({
  action: z.enum(["status", "respond", "respond_with_types", "confirm_lunch", "summary", "update_prices", "update_lunch"]),
  event_id: z.string().uuid().optional(),
  invite_id: z.string().uuid().optional(),
  token: z.string().uuid().optional(),
  response: z.enum(["voy", "no_voy"]).optional(),
  participation_mode: z.enum(["fondo_y_almuerzo", "solo_fondo", "solo_almuerzo"]).nullable().optional(),
  guests_count: z.number().int().min(0).max(500).optional(),
  cyclists: z.array(z.object({
    name: z.string().trim().min(2).max(100),
    category: z.literal("adult"),
    lunch: z.boolean(),
  })).max(10).optional(),
  non_cyclists: z.array(z.object({
    name: z.string().trim().min(2).max(100),
    category: z.enum(["adult", "child_4_9", "under_4"]),
  })).max(500).optional(),
  accept_terms: z.boolean().optional(),
  adults_count: z.number().int().min(0).max(501).optional(),
  children_4_9_count: z.number().int().min(0).max(501).optional(),
  under_4_count: z.number().int().min(0).max(501).optional(),
  adult_price: z.number().min(0).max(10_000_000).optional(),
  child_4_9_price: z.number().min(0).max(10_000_000).optional(),
  under_4_price: z.number().min(0).max(10_000_000).optional(),
  prices_note: z.string().max(1000).optional(),
  status: z.enum(["intencion_confirmada", "instrucciones_pendientes", "instrucciones_enviadas", "comprobante_informado", "pago_verificado"]).optional(),
  comment: z.string().max(2000).optional(),
  receipt_reference: z.string().max(500).nullable().optional(),
});

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

async function requireAdmin(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new Error("Sesión requerida");
  const { data: { user }, error } = await db.auth.getUser(jwt);
  if (error || !user) throw new Error("Sesión inválida");
  const { data: isAdmin } = await db.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) throw new Error("Permisos de administración requeridos");
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  return { user, client };
}

async function publicStatus(token: string) {
  const { data, error } = await db.rpc("get_event_rsvp_by_token", { p_token: token });
  if (error) throw error;
  return data;
}

const FONDAZO_ID = "08fc7e07-10df-4ace-b3ed-a0d581b6f7c9";
const CLAUDIO_EMAIL = Deno.env.get("FONDAZO_CLAUDIO_EMAIL") || "claudioreybaud@ciclismoreybaud.com";
const htmlEscape = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);

/**
 * Sólo después de guardar el RSVP. Cada nombre se encola una sola vez por
 * invitación, y la RPC de claim evita dos envíos simultáneos por reintentos.
 * Un fallo en el correo no revierte ni bloquea la respuesta del alumno.
 */
async function notifyClaudioAboutCyclists(token: string): Promise<void> {
  const { data: invite, error: lookupError } = await db.from("event_rsvp_invites")
    .select("id,event_id,recipient_name,recipient_email,response,is_test,cyclist_guests")
    .eq("token", token).maybeSingle();
  if (lookupError) throw lookupError;
  if (!invite || invite.event_id !== FONDAZO_ID || invite.is_test || invite.response !== "voy") return;

  const distinct = new Map<string, string>();
  for (const guest of Array.isArray(invite.cyclist_guests) ? invite.cyclist_guests : []) {
    const name = String(guest?.name || "").trim().replace(/\\s+/g, " ");
    const key = name.normalize("NFKC").toLocaleLowerCase("es-AR");
    if (name.length >= 2 && name.length <= 100 && !distinct.has(key)) distinct.set(key, name);
  }
  if (distinct.size) {
    const { error } = await db.from("event_rsvp_guest_alerts").upsert(
      [...distinct].map(([guest_key, guest_name]) => ({
        event_id: invite.event_id, invite_id: invite.id, guest_key, guest_name,
      })),
      { onConflict: "invite_id,guest_key", ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  // También reintenta notificaciones pendientes de este mismo invitante.
  const { data: alerts, error: claimError } = await db.rpc("claim_event_rsvp_guest_alerts", {
    p_invite_id: invite.id,
  });
  if (claimError) throw claimError;
  for (const alert of alerts || []) {
    let sendResult: { sent: boolean; error?: string; reason?: string };
    try {
      const guestName = htmlEscape(alert.guest_name);
      const studentName = htmlEscape(invite.recipient_name || invite.recipient_email);
      const participation = (invite.cyclist_guests as Array<{ name?: string; lunch?: boolean }> || [])
        .find((item) => (item.name || "").trim().normalize("NFKC").toLocaleLowerCase("es-AR") === alert.guest_key);
      const mode = participation?.lunch ? "Fondo y almuerzo" : "Solo fondo";
      sendResult = await sendManagedEmail({
        to: CLAUDIO_EMAIL,
        subject: "Fondazo | Solicitud de ciclista invitado",
        text: `Hola, Claudio!\n\n${invite.recipient_name || invite.recipient_email} quiere invitar a ${alert.guest_name} al Fondazo del 29/11.\nParticipación solicitada: ${mode}.\nCorreo del alumno: ${invite.recipient_email}.\n\nEl cupo está pendiente de tu aprobación. Revisalo desde la administración de Reybaud.`,
        html: `<p>Hola, Claudio!</p><p><strong>${studentName}</strong> quiere invitar a <strong>${guestName}</strong> al Fondazo del 29/11.</p><p>Participación solicitada: ${mode}.</p><p>Correo del alumno: ${htmlEscape(invite.recipient_email)}</p><p><strong>Solicitud pendiente de tu aprobación.</strong> Revisala desde administración.</p>`,
        label: "fondazo-guest-cyclist-request",
        idempotencyKey: `fondazo-guest-request-${alert.id}`,
        supabase: db,
      });
    } catch (error) {
      sendResult = { sent: false, error: error instanceof Error ? error.message : String(error) };
    }
    const { error: updateError } = await db.from("event_rsvp_guest_alerts")
      .update({
        status: sendResult.sent ? "sent" : "failed",
        sent_at: sendResult.sent ? new Date().toISOString() : null,
        last_error: sendResult.sent ? null : (sendResult.error || sendResult.reason || "Error de envío").slice(0, 1000),
      }).eq("id", alert.id).eq("status", "sending");
    if (updateError) console.error("Fondazo guest alert status update failed", updateError);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método inválido" }, 405);
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Datos inválidos", fields: parsed.error.flatten().fieldErrors }, 400);
    const body = parsed.data;

    if (body.action === "respond_with_types") {
      if (!body.token || !body.response) return json({ error: "Enlace y respuesta requeridos" }, 400);
      const { error } = await db.rpc("respond_event_rsvp_with_guest_types_and_terms", {
        p_token: body.token,
        p_response: body.response,
        p_mode: body.response === "voy" ? body.participation_mode : null,
        p_cyclists: body.response === "voy" ? (body.cyclists || []) : [],
        p_non_cyclists: body.response === "voy" ? (body.non_cyclists || []) : [],
        p_accept_terms: body.accept_terms === true,
      });
      if (error) return json({ error: error.message }, 400);
      const status = await publicStatus(body.token);
      if (!status) return json({ error: "No pudimos recuperar la respuesta guardada." }, 500);
      // La entrega de correo nunca debe demorar la confirmación de asistencia.
      EdgeRuntime.waitUntil(
        notifyClaudioAboutCyclists(body.token).catch((notifyError) => {
          console.error("Fondazo: respuesta guardada, aviso a Claudio pendiente", notifyError);
        }),
      );
      return json(status);
    }

    if (body.action === "status" || body.action === "respond" || body.action === "confirm_lunch") {
      if (!body.token) return json({ error: "Enlace inválido" }, 400);
      if (body.action === "respond") {
        if (!body.response) return json({ error: "Elegí una respuesta" }, 400);
        const { error } = await db.rpc("respond_event_rsvp", {
          p_token: body.token,
          p_response: body.response,
          p_participation_mode: body.response === "voy" ? body.participation_mode : null,
          p_guests_count: body.response === "voy" && body.participation_mode !== "solo_fondo" ? body.guests_count ?? 0 : 0,
        });
        if (error) return json({ error: error.message }, 400);
      }
      if (body.action === "confirm_lunch") {
        const { error } = await db.rpc("confirm_event_rsvp_lunch", {
          p_token: body.token,
          p_adults: body.adults_count,
          p_children_4_9: body.children_4_9_count,
          p_under_4: body.under_4_count,
        });
        if (error) return json({ error: error.message }, 400);
      }
      const status = await publicStatus(body.token);
      if (!status) return json({ error: "Enlace no encontrado o encuesta no disponible" }, 404);
      return json(status);
    }

    const { client } = await requireAdmin(req);
    if (!body.event_id) return json({ error: "Evento requerido" }, 400);
    const { data: event } = await db.from("events").select("id,title,metadata").eq("id", body.event_id).maybeSingle();
    if (!event || event.metadata?.rsvp_enabled !== true) return json({ error: "Confirmación no disponible" }, 404);

    if (body.action === "summary") {
      const [invitesResult, settingsResult, auditResult, alertsResult] = await Promise.all([
        db.from("event_rsvp_invites").select(`id,recipient_name,recipient_email,response,participation_mode,guests_count,
          responded_at,last_sent_at,lunch_status,adults_count,children_4_9_count,under_4_count,lunch_confirmed_at,
          terms_version,terms_accepted_at,receipt_reference,lunch_admin_comment,lunch_status_changed_at`)
          .eq("event_id", body.event_id).eq("is_test", false).order("recipient_name"),
        db.from("event_rsvp_settings").select("*").eq("event_id", body.event_id).maybeSingle(),
        db.from("event_rsvp_lunch_audit").select("id,invite_id,from_status,to_status,comment,receipt_reference,actor_user_id,created_at")
          .eq("event_id", body.event_id).order("created_at", { ascending: false }).limit(200),
        db.from("event_rsvp_guest_alerts").select("invite_id,guest_key,guest_name,status,sent_at,last_error")
          .eq("event_id", body.event_id),
      ]);
      if (invitesResult.error) throw invitesResult.error;
      if (settingsResult.error) throw settingsResult.error;
      if (auditResult.error) throw auditResult.error;
      if (alertsResult.error) throw alertsResult.error;
      return json({
        event_title: event.title,
        rows: invitesResult.data || [],
        prices: settingsResult.data || { prices_confirmed_at: null },
        audit: auditResult.data || [],
        guest_alerts: alertsResult.data || [],
      });
    }

    if (body.action === "update_prices") {
      const { error } = await client.rpc("admin_set_event_rsvp_prices", {
        p_event_id: body.event_id,
        p_adult: body.adult_price,
        p_child_4_9: body.child_4_9_price,
        p_under_4: body.under_4_price,
        p_note: body.prices_note || null,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (body.action === "update_lunch") {
      if (!body.invite_id || !body.status) return json({ error: "Invitación y estado requeridos" }, 400);
      const { error } = await client.rpc("admin_set_event_rsvp_lunch_status", {
        p_invite_id: body.invite_id,
        p_status: body.status,
        p_comment: body.comment || "",
        p_receipt_reference: body.receipt_reference || null,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    return json({ error: "Acción desconocida" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    const authError = /Sesión|Permisos/.test(message);
    return json({ error: authError ? "No autorizado" : message }, authError ? 403 : 500);
  }
});
