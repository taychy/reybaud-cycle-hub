// Filtro por sede en el detalle de programas. Solo filtra la vista: nunca altera datos ni KPIs globales.
export const SEDE_ALL = "todas";
export const SEDE_NONE = "sin_sede";

export interface SedeOpt { id: string; nombre: string }

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Inscripciones: el campo existente es `suscripciones.programa_sede_id`. */
export function matchesSedeId(sedeId: string | null | undefined, filter: string, sedes: SedeOpt[]): boolean {
  if (filter === SEDE_ALL) return true;
  const known = !!sedeId && sedes.some((s) => s.id === sedeId);
  if (filter === SEDE_NONE) return !known;
  return sedeId === filter;
}

/** Preinscripciones: la sede es la respuesta de texto del formulario; se resuelve por nombre. */
export function resolveSedeByName(answer: string | null | undefined, sedes: SedeOpt[]): string | null {
  if (!answer) return null;
  const a = norm(answer);
  if (!a) return null;
  const exact = sedes.find((s) => norm(s.nombre) === a);
  if (exact) return exact.id;
  const partial = sedes.filter((s) => a.includes(norm(s.nombre)));
  return partial.length === 1 ? partial[0].id : null;
}

export function sedeLabel(sedeId: string | null | undefined, sedes: SedeOpt[]): string | null {
  return sedes.find((s) => s.id === sedeId)?.nombre ?? null;
}
