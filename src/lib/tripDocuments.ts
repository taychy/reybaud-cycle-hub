import { supabase } from "@/integrations/supabase/client";

const BUCKET = "trip-documents";

/**
 * Convierte un valor almacenado en `reservation_checklist_data.file_url`
 * a un path dentro del bucket `trip-documents`.
 *
 * Acepta:
 *  - paths nuevos: "alumnoId/reservationId/archivo.jpg"
 *  - URLs públicas legacy: ".../storage/v1/object/public/trip-documents/<path>"
 *  - URLs firmadas legacy: ".../storage/v1/object/sign/trip-documents/<path>?token=..."
 */
export const extractTripDocumentPath = (value: string | null | undefined): string | null => {
  if (!value) return null;
  if (!value.startsWith("http://") && !value.startsWith("https://")) return value;
  const marker = `/${BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx < 0) return null;
  let rest = value.slice(idx + marker.length);
  const q = rest.indexOf("?");
  if (q >= 0) rest = rest.slice(0, q);
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
};

/**
 * Genera una URL firmada temporal (default 1h) para visualizar un archivo
 * del bucket privado `trip-documents`. Acepta path o URL legacy.
 */
export const getTripDocumentSignedUrl = async (
  value: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> => {
  const path = extractTripDocumentPath(value);
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};
