// Helpers para la relación many-to-many coach ↔ sedes (`coach_sedes`).
// `coaches.sede_id` se mantiene como "sede principal" para compatibilidad legada.

/** Sedes efectivas del coach: las de la relación, o el legado como fallback. */
export function effectiveCoachSedes(
  relacion: string[] | undefined | null,
  legacySedeId: string | null | undefined
): string[] {
  const rel = dedupe((relacion || []).filter(Boolean));
  if (rel.length > 0) return rel;
  return legacySedeId ? [legacySedeId] : [];
}

/** Elimina duplicados preservando el orden. */
export function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Diferencia idempotente entre lo guardado y lo seleccionado. */
export function diffCoachSedes(
  existentes: string[],
  seleccionadas: string[]
): { toAdd: string[]; toRemove: string[] } {
  const cur = new Set(dedupe(existentes));
  const next = new Set(dedupe(seleccionadas));
  return {
    toAdd: [...next].filter((id) => !cur.has(id)),
    toRemove: [...cur].filter((id) => !next.has(id)),
  };
}

/**
 * Sede principal compatible: se conserva la actual si sigue seleccionada;
 * si no, la primera seleccionada; si no hay ninguna, null.
 */
export function resolvePrincipalSede(
  actual: string | null | undefined,
  seleccionadas: string[]
): string | null {
  const sel = dedupe(seleccionadas.filter(Boolean));
  if (actual && sel.includes(actual)) return actual;
  return sel[0] ?? null;
}
