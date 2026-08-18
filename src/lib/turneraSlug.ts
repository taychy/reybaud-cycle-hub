/**
 * Slugs de servicios de la Turnera.
 * - slugifyServicio: genera el slug canónico desde el nombre del servicio.
 * - resolveServicioSlug: mapeo explícito de aliases legacy → slug canónico.
 */

export function slugifyServicio(input: string): string {
  return String(input ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Aliases explícitos de slugs semánticos antiguos.
 * No usamos trim/normalización genérica para no confundir servicios distintos
 * (por ejemplo "Personalizada " legacy correspondía a Clase en Pareja).
 */
export const LEGACY_SERVICIO_SLUG_ALIASES: Record<string, string> = {
  "evaluatoria-60": "clase-evaluatoria",
  "personalizada-60": "personalizada",
  "Personalizada": "clase-en-pareja",
  "Personalizada ": "clase-en-pareja",
};

/** Devuelve el slug canónico a consultar para un slug de URL. */
export function resolveServicioSlug(slug: string | undefined | null): string {
  if (!slug) return "";
  return LEGACY_SERVICIO_SLUG_ALIASES[slug] ?? slug;
}
