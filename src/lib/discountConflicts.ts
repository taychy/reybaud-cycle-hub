// Detección de conflictos entre descuentos asignados a un alumno.
// Regla acordada: dos descuentos vigentes chocan si comparten "aplica_a"
// (planes, eventos, tienda) o si alguno de los dos es "todo" (comodín global).

export type AplicaA = "todo" | "planes" | "eventos" | "tienda" | string;

const APLICA_LABEL: Record<string, string> = {
  todo: "todos los rubros",
  planes: "Planes",
  eventos: "Eventos",
  tienda: "Tienda",
};

export const aplicaLabel = (v: AplicaA) => APLICA_LABEL[v] || v;

export function aplicaAConflict(a: AplicaA, b: AplicaA): boolean {
  return a === b || a === "todo" || b === "todo";
}

export interface ConflictItem {
  id: string;
  aplica_a: AplicaA;
  nombre?: string;
}

/** Dado un nuevo aplica_a, devuelve los existentes (vigentes) que chocan. */
export function findConflictingExisting<T extends ConflictItem>(
  newAplicaA: AplicaA,
  existing: T[]
): T[] {
  return existing.filter((e) => aplicaAConflict(newAplicaA, e.aplica_a));
}

/** Indica si hay al menos un par en conflicto dentro del set. */
export function hasAnyConflict(items: ConflictItem[]): boolean {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (aplicaAConflict(items[i].aplica_a, items[j].aplica_a)) return true;
    }
  }
  return false;
}

/** Devuelve los "ámbitos" donde hay 2+ descuentos vigentes que se pisan. */
export function getConflictScopes(items: ConflictItem[]): string[] {
  const scopes = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (aplicaAConflict(items[i].aplica_a, items[j].aplica_a)) {
        const a = items[i].aplica_a;
        const b = items[j].aplica_a;
        // Si uno es "todo", reportamos el otro (más informativo).
        if (a === "todo" && b !== "todo") scopes.add(b);
        else if (b === "todo" && a !== "todo") scopes.add(a);
        else scopes.add(a);
      }
    }
  }
  return Array.from(scopes);
}

/** Parse fecha literal YYYY-MM-DD sin timezone drift. */
const parseFechaLocal = (s: string | null) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** Vigente = activo + dentro de la ventana de fechas. */
export function isVigente(
  fechaInicio: string | null,
  fechaFin: string | null,
  activo: boolean
): boolean {
  if (!activo) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fi = parseFechaLocal(fechaInicio);
  const ff = parseFechaLocal(fechaFin);
  if (fi && fi > today) return false;
  if (ff && ff < today) return false;
  return true;
}
