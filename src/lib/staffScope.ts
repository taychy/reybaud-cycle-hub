/**
 * Alcance ("scope") del Chequeo de Alumnos del staff.
 *
 * Dos tipos de alcance:
 *  - `grupo`    → G1/G2/G3/G4/... tal como estaba (columna `alumnos.grupo`)
 *  - `programa` → programas cerrados/comerciales activos, resueltos por
 *                 suscripciones ACTIVAS (nunca por `alumnos.grupo`).
 *
 * Ningún helper de este archivo modifica datos: sólo resuelve el alcance.
 */

export type StaffScope =
  | { tipo: "grupo"; value: string }
  | { tipo: "programa"; value: string };

export interface StaffProgram {
  plan_id: string;
  nombre: string;
  alumnos_activos: number;
}

export interface StudentLike {
  id: string;
  nombre: string;
  apellido?: string | null;
}

export interface SubscriptionLike {
  alumno_id: string;
  plan_id: string;
  estado: string | null;
  cancelada_at?: string | null;
}

/** Alcance por defecto: primer grupo si hay, si no el primer programa. */
export function defaultScope(
  grupos: string[],
  programas: StaffProgram[],
): StaffScope | null {
  if (grupos.length > 0) return { tipo: "grupo", value: grupos[0] };
  if (programas.length > 0) return { tipo: "programa", value: programas[0].plan_id };
  return null;
}

/** ¿El alcance guardado sigue siendo válido con las opciones actuales? */
export function isScopeAvailable(
  scope: StaffScope | null,
  grupos: string[],
  programas: StaffProgram[],
): boolean {
  if (!scope) return false;
  return scope.tipo === "grupo"
    ? grupos.includes(scope.value)
    : programas.some((p) => p.plan_id === scope.value);
}

/** Etiqueta a mostrar en "Ver alumnos de:". */
export function scopeLabel(
  scope: StaffScope | null,
  programas: StaffProgram[],
): string {
  if (!scope) return "—";
  if (scope.tipo === "grupo") return scope.value;
  const p = programas.find((x) => x.plan_id === scope.value);
  if (!p) return "Programa";
  return `${p.nombre} · ${p.alumnos_activos} ${p.alumnos_activos === 1 ? "alumno" : "alumnos"}`;
}

/**
 * Resuelve los ids de alumno de un programa a partir de sus suscripciones.
 * Sólo `activa` y sin fecha de cancelación. Sin duplicados.
 */
export function resolveProgramStudentIds(
  subs: SubscriptionLike[],
  planId: string,
): string[] {
  const seen = new Set<string>();
  for (const s of subs) {
    if (s.plan_id !== planId) continue;
    if (s.estado !== "activa") continue;
    if (s.cancelada_at) continue;
    seen.add(s.alumno_id);
  }
  return Array.from(seen);
}

/** Sólo se ofrecen programas que hoy tienen alumnos activos. */
export function visiblePrograms(programas: StaffProgram[]): StaffProgram[] {
  return programas.filter((p) => Number(p.alumnos_activos) > 0);
}
