// Recepción pública de fotos de eventos (módulo reutilizable).
// Acciones: info | start | finalize. El archivo se sube directo al bucket privado
// mediante URLs de subida firmadas de un solo uso; el servidor valida tipo, tamaño
// y firma binaria antes de dar el envío por completo. Nunca devuelve URLs de lectura.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const BUCKET = "event-photos";
const MAX_FILE = 15 * 1024 * 1024;
const MAX_TOTAL = 150 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
};
export const OWNERSHIP_VERSION = "event-photos-ownership-v1";
export const CONSENT_VERSION = "event-photos-publication-v1";
const LIMIT_PER_CLIENT_HOUR = 6;
const LIMIT_PER_EMAIL_DAY = 20;
const LIMIT_PER_EVENT_HOUR = 300;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const sha256 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

const Info = z.object({ action: z.literal("info"), event_id: z.string().uuid() });
const Start = z.object({
  action: z.literal("start"),
  event_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  ownership_declared: z.literal(true),
  ownership_text_version: z.literal(OWNERSHIP_VERSION),
  publication_consent: z.boolean(),
  publication_consent_text_version: z.literal(CONSENT_VERSION).optional(),
  files: z.array(z.object({
    name: z.string().max(200),
    type: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
    size: z.number().int().positive().max(MAX_FILE),
  })).min(1).max(10),
});
const Finalize = z.object({
  action: z.literal("finalize"),
  submission_id: z.string().uuid(),
  token: z.string().min(32).max(128),
});

function magicOk(type: string, b: Uint8Array) {
  const s = (o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));
  if (type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/png") return b[0] === 0x89 && s(1, 3) === "PNG";
  if (type === "image/webp") return s(0, 4) === "RIFF" && s(8, 4) === "WEBP";
  if (type === "image/heic" || type === "image/heif") {
    return s(4, 4) === "ftyp" && ["heic", "heix", "hevc", "heif", "mif1", "msf1", "heim", "heis"].includes(s(8, 4));
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: unknown;
  try { body = await req.json(); } catch { return json(400, { error: "Solicitud inválida" }); }
  const action = (body as { action?: string })?.action;

  const loadEvent = async (eventId: string) => {
    const { data: setting } = await db.from("event_photo_settings").select("enabled, max_files_per_submission").eq("event_id", eventId).maybeSingle();
    if (!setting?.enabled) return null;
    const { data: ev } = await db.from("events").select("id, title, date, end_date, location").eq("id", eventId).maybeSingle();
    return ev ? { ...ev, max_files: setting.max_files_per_submission } : null;
  };

  try {
    if (action === "info") {
      const p = Info.safeParse(body);
      if (!p.success) return json(400, { error: "Evento inválido" });
      const ev = await loadEvent(p.data.event_id);
      if (!ev) return json(404, { error: "La recepción de fotos no está habilitada para este evento." });
      return json(200, { event: ev, limits: { max_files: ev.max_files, max_file_bytes: MAX_FILE }, versions: { ownership: OWNERSHIP_VERSION, consent: CONSENT_VERSION } });
    }

    if (action === "start") {
      const p = Start.safeParse(body);
      if (!p.success) return json(400, { error: "Revisá los datos del formulario.", fields: p.error.flatten().fieldErrors });
      const d = p.data;
      const ev = await loadEvent(d.event_id);
      if (!ev) return json(404, { error: "La recepción de fotos no está habilitada para este evento." });
      if (d.files.length > ev.max_files) return json(400, { error: `Podés enviar hasta ${ev.max_files} fotos por envío.` });
      const total = d.files.reduce((a, f) => a + f.size, 0);
      if (total > MAX_TOTAL) return json(400, { error: "El envío supera el tamaño total permitido." });
      if (d.publication_consent && !d.publication_consent_text_version) return json(400, { error: "Falta la versión del consentimiento." });

      // Identidad opcional: si hay sesión válida se registra el usuario (nunca se usa para autorizar).
      let userId: string | null = null;
      const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      if (jwt) {
        const { data } = await db.auth.getUser(jwt);
        userId = data?.user?.id ?? null;
      }

      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
      const fp = await sha256(`${ip}|${req.headers.get("user-agent") || ""}|event-photos`);
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const dayAgo = new Date(Date.now() - 86400_000).toISOString();
      const [c1, c2, c3] = await Promise.all([
        db.from("event_photo_submissions").select("id", { count: "exact", head: true }).eq("client_fingerprint", fp).gte("created_at", hourAgo),
        db.from("event_photo_submissions").select("id", { count: "exact", head: true }).ilike("submitter_email", d.email).gte("created_at", dayAgo),
        db.from("event_photo_submissions").select("id", { count: "exact", head: true }).eq("event_id", d.event_id).gte("created_at", hourAgo),
      ]);
      if ((c1.count ?? 0) >= LIMIT_PER_CLIENT_HOUR || (c2.count ?? 0) >= LIMIT_PER_EMAIL_DAY || (c3.count ?? 0) >= LIMIT_PER_EVENT_HOUR) {
        return json(429, { error: "Recibimos muchos envíos seguidos. Probá de nuevo en un rato." });
      }

      const token = crypto.randomUUID() + crypto.randomUUID();
      const now = new Date().toISOString();
      const { data: sub, error: sErr } = await db.from("event_photo_submissions").insert({
        event_id: d.event_id, submitter_name: d.name, submitter_email: d.email, user_id: userId,
        ownership_declared: true, ownership_text_version: OWNERSHIP_VERSION, ownership_accepted_at: now,
        publication_consent: d.publication_consent,
        publication_consent_text_version: d.publication_consent ? CONSENT_VERSION : null,
        publication_consent_at: d.publication_consent ? now : null,
        finalize_token_hash: await sha256(token), client_fingerprint: fp, file_count: d.files.length,
      }).select("id").single();
      if (sErr || !sub) { console.error("[event-photo-upload] submission", sErr); return json(500, { error: "No pudimos iniciar el envío." }); }

      const uploads: { index: number; signed_url: string }[] = [];
      for (let i = 0; i < d.files.length; i++) {
        const f = d.files[i];
        const path = `${d.event_id}/${sub.id}/${crypto.randomUUID()}.${MIME_EXT[f.type]}`;
        const { error: pErr } = await db.from("event_photos").insert({
          submission_id: sub.id, event_id: d.event_id, storage_path: path,
          original_filename: f.name.slice(0, 200), mime_type: f.type, size_bytes: f.size,
        });
        const { data: signed, error: uErr } = pErr ? { data: null, error: pErr } : await db.storage.from(BUCKET).createSignedUploadUrl(path);
        if (uErr || !signed) {
          console.error("[event-photo-upload] signing", uErr);
          await db.from("event_photo_submissions").update({ status: "failed" }).eq("id", sub.id);
          await db.from("event_photos").update({ upload_status: "failed" }).eq("submission_id", sub.id);
          return json(500, { error: "No pudimos preparar la subida." });
        }
        uploads.push({ index: i, signed_url: signed.signedUrl });
      }
      return json(200, { submission_id: sub.id, token, uploads });
    }

    if (action === "finalize") {
      const p = Finalize.safeParse(body);
      if (!p.success) return json(400, { error: "Solicitud inválida" });
      const { data: sub } = await db.from("event_photo_submissions").select("id, status, finalize_token_hash, created_at")
        .eq("id", p.data.submission_id).maybeSingle();
      if (!sub || sub.finalize_token_hash !== await sha256(p.data.token)) return json(403, { error: "Envío inválido" });
      if (sub.status !== "uploading") {
        const { count } = await db.from("event_photos").select("id", { count: "exact", head: true }).eq("submission_id", sub.id).eq("upload_status", "stored");
        return json(200, { status: sub.status, stored: count ?? 0 });
      }
      const { data: photos } = await db.from("event_photos").select("id, storage_path, mime_type, size_bytes").eq("submission_id", sub.id);
      let stored = 0;
      const failed: string[] = [];
      for (const ph of photos ?? []) {
        let ok = false;
        const { data: s } = await db.storage.from(BUCKET).createSignedUrl(ph.storage_path, 60);
        if (s?.signedUrl) {
          const r = await fetch(s.signedUrl, { headers: { Range: "bytes=0-31" } });
          if (r.ok) {
            const head = new Uint8Array(await r.arrayBuffer()).slice(0, 32);
            const totalSize = Number((r.headers.get("content-range") || "").split("/")[1] || r.headers.get("content-length") || 0);
            ok = magicOk(ph.mime_type, head) && totalSize > 0 && totalSize <= MAX_FILE;
            if (ok && totalSize !== ph.size_bytes) {
              await db.from("event_photos").update({ size_bytes: totalSize }).eq("id", ph.id);
            }
          } else { await r.body?.cancel(); }
        }
        if (ok) { stored++; await db.from("event_photos").update({ upload_status: "stored" }).eq("id", ph.id); }
        else { failed.push(ph.storage_path); await db.from("event_photos").update({ upload_status: "failed" }).eq("id", ph.id); }
      }
      if (failed.length) await db.storage.from(BUCKET).remove(failed);
      const status = stored > 0 ? "complete" : "failed";
      await db.from("event_photo_submissions").update({ status, completed_at: new Date().toISOString(), file_count: stored }).eq("id", sub.id);
      return json(200, { status, stored, failed: failed.length });
    }

    return json(400, { error: "Acción desconocida" });
  } catch (e) {
    console.error("[event-photo-upload]", e);
    return json(500, { error: "Ocurrió un error inesperado." });
  }
});
