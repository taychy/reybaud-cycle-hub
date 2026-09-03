/**
 * Helpers puros del bloque "Distribución de activos" de Admin > Alumnos.
 *
 * Fuentes de verdad (no se duplican datos):
 *  - Activos  → `alumnos.estado === 'activo'` (mismo criterio que el chip "Activos").
 *  - Grupo    → `alumnos.grupo` (incluye el literal "Sin grupo").
 *  - Plan act.→ suscripción con estado efectivo activo, resuelta por el caller
 *               con los mismos helpers que usa la pantalla (`getActiveSub`).
 *  - Staff    → cruce por identidad `alumnos.user_id` con `coaches` / `user_roles`
 *               / `admin_profiles`. No existe categoría "staff" en `alumnos`.
 */

export interface DistAlumno {
  id: string;
  grupo: string | null;
}

export interface PlanEntry {
  alumnoId: string;
  planId: string;
  planNombre: string;
}

export interface GrupoBucket {
  grupo: string;
  count: number;
}

export interface PlanBucket {
  planId: string;
  planNombre: string;
  count: number;
}

export const SIN_GRUPO = "Sin grupo";

/** Conteos mutuamente excluyentes por grupo real. Suman el total de activos. */
export function distribucionPorGrupo(alumnos: DistAlumno[]): GrupoBucket[] {
  const map = new Map<string, number>();
  for (const a of alumnos) {
    const g = a.grupo && a.grupo.trim() !== "" ? a.grupo : SIN_GRUPO;
    map.set(g, (map.get(g) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([grupo, count]) => ({ grupo, count }))
    .sort((x, y) => {
      if (x.grupo === SIN_GRUPO) return 1;
      if (y.grupo === SIN_GRUPO) return -1;
      if (y.count !== x.count) return y.count - x.count;
      return x.grupo.localeCompare(y.grupo, "es");
    });
}

/** Alumnos ÚNICOS por plan activo. No es una partición si hay multi-plan. */
export function distribucionPorPlan(entries: PlanEntry[]): PlanBucket[] {
  const map = new Map<string, { planNombre: string; ids: Set<string> }>();
  for (const e of entries) {
    let b = map.get(e.planId);
    if (!b) {
      b = { planNombre: e.planNombre, ids: new Set() };
      map.set(e.planId, b);
    }
    b.ids.add(e.alumnoId);
  }
  return Array.from(map.entries())
    .map(([planId, b]) => ({ planId, planNombre: b.planNombre, count: b.ids.size }))
    .sort((x, y) => (y.count !== x.count ? y.count - x.count : x.planNombre.localeCompare(y.planNombre, "es")));
}

/** Cantidad de alumnos con más de un plan activo distinto a la vez. */
export function contarMultiPlan(entries: PlanEntry[]): number {
  const byAlumno = new Map<string, Set<string>>();
  for (const e of entries) {
    let s = byAlumno.get(e.alumnoId);
    if (!s) { s = new Set(); byAlumno.set(e.alumnoId, s); }
    s.add(e.planId);
  }
  let n = 0;
  byAlumno.forEach((s) => { if (s.size > 1) n++; });
  return n;
}

/** Activos que no tienen ninguna suscripción activa vigente. */
export function contarSinPlanActivo(alumnos: DistAlumno[], entries: PlanEntry[]): number {
  const conPlan = new Set(entries.map((e) => e.alumnoId));
  return alumnos.filter((a) => !conPlan.has(a.id)).length;
}

/** Staff: sólo por cruce de identidad confiable (`user_id`). */
export function contarStaffConFicha(
  alumnos: { id: string; user_id: string | null }[],
  staffUserIds: Set<string>,
): number {
  return alumnos.filter((a) => !!a.user_id && staffUserIds.has(a.user_id)).length;
}
