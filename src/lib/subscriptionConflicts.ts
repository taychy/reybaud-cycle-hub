/**
 * Reglas de no-solape entre suscripciones vigentes (alineadas con el trigger DB
 * `check_duplicate_active_subscription`):
 *
 * - grupal (Ruta/Gravel): sólo UNA grupal vigente por período.
 * - pista (velódromo):    sólo UNA pista  vigente por período.
 * - pausa (Plan reducido): NO puede convivir con NINGUNA otra vigente.
 * - asesoria: convive con todo (nunca genera conflicto).
 * - otro: mismo plan_id + misma fecha_fin = duplicado.
 *
 * Una suscripción "vigente" = sin cancelada_at + (sin fecha_fin OR fecha_fin >= hoy).
 */

type SubLike = {
  id: string;
  plan_id: string;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  cancelada_at?: string | null;
  planes?: { categoria?: string | null } | null;
};

const overlap = (a: SubLike, b: SubLike) => {
  const aIni = a.fecha_inicio || null;
  const aFin = a.fecha_fin || null;
  const bIni = b.fecha_inicio || null;
  const bFin = b.fecha_fin || null;
  const cond1 = !aIni || !bFin || aIni <= bFin;
  const cond2 = !bIni || !aFin || bIni <= aFin;
  return cond1 && cond2;
};

const cat = (s: SubLike) => s.planes?.categoria || "otro";

/**
 * Devuelve true si el alumno tiene al menos un conflicto real entre sus suscripciones
 * vigentes pasadas (las que la app ya filtró como activas/vigentes).
 */
export function hasSubscriptionConflict(vigentes: SubLike[]): boolean {
  if (!vigentes || vigentes.length < 2) return false;

  // pausa convive con NADA
  const pausas = vigentes.filter(s => cat(s) === "pausa");
  for (const p of pausas) {
    if (vigentes.some(o => o.id !== p.id && overlap(p, o))) return true;
  }

  // 2+ grupales o 2+ pistas que se solapen
  for (const modalidad of ["grupal", "pista"] as const) {
    const ofMod = vigentes.filter(s => cat(s) === modalidad);
    for (let i = 0; i < ofMod.length; i++) {
      for (let j = i + 1; j < ofMod.length; j++) {
        if (overlap(ofMod[i], ofMod[j])) return true;
      }
    }
  }

  // "otro": mismo plan_id + misma fecha_fin
  const otros = vigentes.filter(s => cat(s) === "otro");
  const seen = new Set<string>();
  for (const s of otros) {
    const key = `${s.plan_id}|${s.fecha_fin || ""}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }

  return false;
}
