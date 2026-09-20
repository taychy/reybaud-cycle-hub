// Webhook público de Meta WhatsApp Cloud API.
// GET  -> verificación (hub.challenge)
// POST -> mensajes entrantes y actualizaciones de estado
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

const ok = (body: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { ...corsHeaders, ...extra } });

/** Valida X-Hub-Signature-256 sólo si META_APP_SECRET está configurado. */
async function signatureValid(raw: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get("META_APP_SECRET");
  if (!secret) return true; // aún no configurado: no bloquea la primera prueba
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7);
  if (given.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/** Texto legible + media básica según el tipo de mensaje. */
function extractContent(msg: any): { body: string | null; media: Record<string, unknown> } {
  const type = String(msg?.type || "unknown");
  switch (type) {
    case "text":
      return { body: msg.text?.body ?? null, media: {} };
    case "image":
    case "audio":
    case "video":
    case "document":
    case "sticker": {
      const m = msg[type] ?? {};
      return {
        body: m.caption ?? m.filename ?? null,
        media: { id: m.id ?? null, mime_type: m.mime_type ?? null, sha256: m.sha256 ?? null, filename: m.filename ?? null, voice: m.voice ?? null },
      };
    }
    case "location": {
      const l = msg.location ?? {};
      return { body: l.name || l.address || `${l.latitude}, ${l.longitude}`, media: { location: l } };
    }
    case "button":
      return { body: msg.button?.text ?? null, media: {} };
    case "interactive": {
      const i = msg.interactive ?? {};
      return { body: i.button_reply?.title ?? i.list_reply?.title ?? null, media: { interactive: i } };
    }
    case "contacts":
      return { body: "Contacto compartido", media: { contacts: msg.contacts ?? [] } };
    case "reaction":
      return { body: msg.reaction?.emoji ?? null, media: { reaction: msg.reaction } };
    default:
      return { body: null, media: { unsupported_type: type } };
  }
}

const previewFor = (type: string, body: string | null) => {
  if (body?.trim()) return body.trim().slice(0, 200);
  const labels: Record<string, string> = {
    image: "📷 Imagen", audio: "🎤 Audio", video: "🎬 Video",
    document: "📄 Documento", sticker: "🙂 Sticker", location: "📍 Ubicación",
  };
  return labels[type] || `Mensaje (${type})`;
};

const tsToIso = (ts: unknown) => {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);

  // 1) Verificación de Meta
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && expected && token === expected) {
      return ok(challenge, 200, { "Content-Type": "text/plain" });
    }
    console.warn("[whatsapp-webhook] verificación rechazada", { mode, hasExpected: !!expected });
    return ok("Forbidden", 403, { "Content-Type": "text/plain" });
  }

  if (req.method !== "POST") return ok("Method not allowed", 405);

  const raw = await req.text();
  if (!(await signatureValid(raw, req.headers.get("x-hub-signature-256")))) {
    console.error("[whatsapp-webhook] firma inválida");
    return ok("Invalid signature", 401);
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return ok("Bad request", 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};

        // --- Mensajes entrantes ---
        const contacts: any[] = value.contacts ?? [];
        for (const msg of value.messages ?? []) {
          const waId = String(msg.from ?? contacts[0]?.wa_id ?? "").replace(/\D/g, "");
          if (!waId) continue;

          const contact = contacts.find((c) => String(c?.wa_id || "").replace(/\D/g, "") === waId) ?? contacts[0];
          const contactName = contact?.profile?.name ?? null;
          const metaId = msg.id ? String(msg.id) : null;
          const type = String(msg.type || "unknown");
          const { body, media } = extractContent(msg);
          const when = tsToIso(msg.timestamp);
          const preview = previewFor(type, body);

          // Conversación (upsert por wa_id, sin pisar el nombre con null)
          const { data: existing } = await supabase
            .from("whatsapp_conversations")
            .select("id, unread_count, contact_name")
            .eq("wa_id", waId)
            .maybeSingle();

          let conversationId: string | null = existing?.id ?? null;
          if (!conversationId) {
            const { data: created, error: insErr } = await supabase
              .from("whatsapp_conversations")
              .insert({
                wa_id: waId,
                phone_display: `+${waId}`,
                contact_name: contactName,
                status: "open",
                needs_reply: true,
                unread_count: 1,
                last_message_at: when,
                last_inbound_at: when,
                last_message_preview: preview,
                last_message_direction: "inbound",
              })
              .select("id")
              .single();
            if (insErr) {
              // Carrera: otro evento la creó primero
              const { data: again } = await supabase
                .from("whatsapp_conversations").select("id").eq("wa_id", waId).maybeSingle();
              conversationId = again?.id ?? null;
              if (!conversationId) { console.error("[whatsapp-webhook] conversación", insErr.message); continue; }
            } else {
              conversationId = created!.id;
            }
          } else {
            await supabase
              .from("whatsapp_conversations")
              .update({
                contact_name: contactName ?? existing?.contact_name ?? null,
                phone_display: `+${waId}`,
                last_message_at: when,
                last_inbound_at: when,
                last_message_preview: preview,
                last_message_direction: "inbound",
                needs_reply: true,
                unread_count: (existing?.unread_count ?? 0) + 1,
                updated_at: new Date().toISOString(),
              })
              .eq("id", conversationId);
          }

          // Mensaje (idempotente por meta_message_id)
          if (metaId) {
            const { data: dup } = await supabase
              .from("whatsapp_messages").select("id").eq("meta_message_id", metaId).maybeSingle();
            if (dup) continue;
          }

          const { error: msgErr } = await supabase.from("whatsapp_messages").insert({
            conversation_id: conversationId,
            meta_message_id: metaId,
            direction: "inbound",
            message_type: type,
            body,
            media,
            reply_to_meta_message_id: msg.context?.id ?? null,
            status: "received",
            meta_timestamp: when,
            raw_payload: msg,
          });
          if (msgErr && msgErr.code !== "23505") console.error("[whatsapp-webhook] mensaje", msgErr.message);
        }

        // --- Actualizaciones de estado ---
        for (const st of value.statuses ?? []) {
          const metaId = st?.id ? String(st.id) : null;
          const status = String(st?.status || "");
          if (!metaId || !["sent", "delivered", "read", "failed"].includes(status)) continue;
          const err = Array.isArray(st.errors) ? st.errors[0] : null;
          const { error } = await supabase
            .from("whatsapp_messages")
            .update({
              status,
              error_code: err?.code != null ? String(err.code) : null,
              error_message: err?.message ?? err?.title ?? null,
            })
            .eq("meta_message_id", metaId);
          if (error) console.error("[whatsapp-webhook] status", error.message);
        }
      }
    }
  } catch (e) {
    // Meta reintenta si no respondemos 200; logueamos y confirmamos recepción.
    console.error("[whatsapp-webhook] error procesando:", (e as Error).message);
  }

  return ok(JSON.stringify({ received: true }), 200, { "Content-Type": "application/json" });
});
