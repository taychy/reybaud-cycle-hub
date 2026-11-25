// Módulo reutilizable de recepción de fotos de eventos (cliente).
// Las versiones deben coincidir con supabase/functions/event-photo-upload.
export const EVENT_PHOTO_OWNERSHIP_VERSION = "event-photos-ownership-v1";
export const EVENT_PHOTO_CONSENT_VERSION = "event-photos-publication-v1";
export const EVENT_PHOTO_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const EVENT_PHOTO_MAX_FILES = 10;
export const EVENT_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export type EventPhotoType = (typeof EVENT_PHOTO_TYPES)[number];

export const OWNERSHIP_TEXT =
  "Declaro que soy autor/a de estas fotos o que tengo permiso de quien las tomó para enviarlas a Reybaud.";
export const CONSENT_TEXT =
  "Autorizo a Ciclismo Reybaud a publicar estas fotos en su web, redes sociales y correos, mencionando el evento. Si aparecen menores de edad, confirmo que cuento con el consentimiento de su madre, padre o responsable.";

export type PhotoReviewStatus = "pendiente" | "apta_publicacion" | "solo_interna" | "rechazada";
export const REVIEW_LABEL: Record<PhotoReviewStatus, string> = {
  pendiente: "Pendiente",
  apta_publicacion: "Apta para publicar",
  solo_interna: "Solo uso interno",
  rechazada: "Rechazada",
};

const EXT_TYPE: Record<string, EventPhotoType> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };

/** Algunos móviles no informan el tipo de HEIC; se deduce por extensión. */
export function resolvePhotoType(file: { name: string; type: string }): EventPhotoType | null {
  const t = file.type.toLowerCase();
  if ((EVENT_PHOTO_TYPES as readonly string[]).includes(t)) return t as EventPhotoType;
  if (t && t !== "application/octet-stream") return null;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPE[ext] ?? null;
}

export function validatePhotoSelection(existing: number, files: { name: string; type: string; size: number }[], max = EVENT_PHOTO_MAX_FILES) {
  const accepted: number[] = [];
  const errors: string[] = [];
  files.forEach((f, i) => {
    if (existing + accepted.length >= max) { errors.push(`Podés elegir hasta ${max} fotos por envío.`); return; }
    if (!resolvePhotoType(f)) { errors.push(`"${f.name}" no es un formato permitido (JPG, PNG, WebP o HEIC). Los videos no se reciben.`); return; }
    if (f.size <= 0) { errors.push(`"${f.name}" está vacío.`); return; }
    if (f.size > EVENT_PHOTO_MAX_FILE_BYTES) { errors.push(`"${f.name}" supera los 15 MB.`); return; }
    accepted.push(i);
  });
  return { accepted, errors: Array.from(new Set(errors)) };
}

/** Una foto solo puede quedar apta para publicar si su envío tiene consentimiento de difusión. */
export function canMarkPublishable(photos: { publication_consent: boolean }[]) {
  return photos.length > 0 && photos.every((p) => p.publication_consent);
}

export const eventPhotosPublicPath = (eventId: string) => `/eventos/${eventId}/fotos`;
export const isEventPhotosPath = (pathname: string) =>
  /^\/eventos\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/fotos\/?$/i.test(pathname);
