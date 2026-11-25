/** Jornada especial de Escuela: evento informativo cuyo CTA abre una inscripción pública de public_jornadas (única fuente de cupos). */
export const SPECIAL_JORNADA_SUBTYPE = "jornada_especial";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidJornadaSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length >= 3 && slug.length <= 80 && SLUG_RE.test(slug);
}

/** Only same-origin paths of the jornada form are accepted: /<slug> (legacy alias) or /jornada/<slug>. */
export function isValidJornadaPath(path: unknown, slug: string): path is string {
  return path === `/${slug}` || path === `/jornada/${slug}`;
}

export type SpecialJornadaLink = { slug: string; path: string };

/** Returns the registration link only when the event is a configured special jornada; otherwise null (no CTA). */
export function getSpecialJornada(metadata: unknown): SpecialJornadaLink | null {
  const m = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, any>;
  if (m.school_subtype !== SPECIAL_JORNADA_SUBTYPE) return null;
  const cfg = m.special_jornada;
  if (!cfg || !isValidJornadaSlug(cfg.slug)) return null;
  const path = isValidJornadaPath(cfg.path, cfg.slug) ? cfg.path : `/jornada/${cfg.slug}`;
  return { slug: cfg.slug, path };
}

export function jornadaPublicUrl(link: SpecialJornadaLink, origin = "https://reybaud-app.com") {
  return `${origin}${link.path}`;
}

/** Badge de tipo consistente: las jornadas especiales de Escuela muestran "Jornada especial"; el resto conserva su etiqueta habitual. */
export function eventTypeBadgeLabel(metadata: unknown, fallback: string): string {
  return getSpecialJornada(metadata) ? "Jornada especial" : fallback;
}
