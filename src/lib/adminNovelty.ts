/**
 * Novedades admin: guarda la marca de "última visita" ANTES de resetearla,
 * para poder resaltar dentro de la sección qué filas son nuevas.
 */
const storageKey = (section: string) => `admin_prev_seen_${section}`;

export const setPrevSeen = (section: string, isoOrNull: string | null) => {
  try {
    sessionStorage.setItem(storageKey(section), isoOrNull ?? "");
  } catch {
    /* noop */
  }
};

export const getPrevSeen = (section: string): Date | null => {
  try {
    const raw = sessionStorage.getItem(storageKey(section));
    if (raw === null) return null; // nunca entramos en esta sesión → no marcar nada
    if (raw === "") return new Date(0); // primera visita histórica → todo es nuevo
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

/** ¿La fila fue creada después de la última visita a la sección? */
export const isNewSince = (createdAt: string | null | undefined, section: string): boolean => {
  if (!createdAt) return false;
  const prev = getPrevSeen(section);
  if (!prev) return false;
  const d = new Date(createdAt);
  return !isNaN(d.getTime()) && d > prev;
};
