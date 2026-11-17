import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  action: z.enum(["status", "respond", "confirm_lunch", "confirm_lunch_named", "summary", "update_prices", "update_lunch"]),
  event_id: z.string().uuid().optional(),
  invite_id: z.string().uuid().optional(),
  token: z.string().uuid().optional(),
  response: z.enum(["voy", "no_voy"]).optional(),
  participation_mode: z.enum(["fondo_y_almuerzo", "solo_fondo", "solo_almuerzo"]).nullable().optional(),
  guests_count: z.number().int().min(0).max(500).optional(),
  guest_details: z.array(z.object({
    name: z.string().trim().min(2).max(100),
    category: z.enum(["adult", "child_4_9", "under_4"]),
  })).max(500).optional(),
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
  if (!data) return data;
  const { data: invite, error: guestsError } = await db.from("event_rsvp_invites")
    .select("lunch_attendees").eq("token", token).maybeSingle();
  if (guestsError) throw guestsError;
  return {
    ...data,
    lunch: { ...data.lunch, attendees: invite?.lunch_attendees || [] },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método inválido" }, 405);
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Datos inválidos", fields: parsed.error.flatten().fieldErrors }, 400);
    const body = parsed.data;

    if (body.action === "status" || body.action === "respond" || body.action === "confirm_lunch" || body.action === "confirm_lunch_named") {
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
      if (body.action === "confirm_lunch_named") {
        if (!body.guest_details) return json({ error: "Completá los nombres y categorías de todos los acompañantes." }, 400);
        const { error } = await db.rpc("confirm_event_rsvp_lunch_named", {
          p_token: body.token,
          p_guests: body.guest_details,
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
      const [invitesResult, settingsResult, auditResult] = await Promise.all([
        db.from("event_rsvp_invites").select(`id,recipient_name,recipient_email,response,participation_mode,guests_count,
          responded_at,last_sent_at,lunch_status,adults_count,children_4_9_count,under_4_count,lunch_attendees,lunch_confirmed_at,
          terms_version,terms_accepted_at,receipt_reference,lunch_admin_comment,lunch_status_changed_at`)
          .eq("event_id", body.event_id).eq("is_test", false).order("recipient_name"),
        db.from("event_rsvp_settings").select("*").eq("event_id", body.event_id).maybeSingle(),
        db.from("event_rsvp_lunch_audit").select("id,invite_id,from_status,to_status,comment,receipt_reference,actor_user_id,created_at")
          .eq("event_id", body.event_id).order("created_at", { ascending: false }).limit(200),
      ]);
      if (invitesResult.error) throw invitesResult.error;
      if (settingsResult.error) throw settingsResult.error;
      if (auditResult.error) throw auditResult.error;
      return json({
        event_title: event.title,
        rows: invitesResult.data || [],
        prices: settingsResult.data || { prices_confirmed_at: null },
        audit: auditResult.data || [],
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
