/**
 * Resolución del teléfono WhatsApp efectivo de un coach y de las opciones de
 * "Grupos asignados".
 *
 * Prioridad del teléfono: `coaches.whatsapp` explícito > ficha de alumno/staff
 * vinculada por `user_id` > ficha vinculada por email exacto normalizado > vacío.
 * Nunca se busca por nombre.
 */

export type CoachPhoneSource = "coach" | "alumno_user_id" | "alumno_email" | "none";

export interface AlumnoContactRow {
  user_id?: string | null;
  email?: string | null;
  telefono?: string | null;
}

export interface CoachContactInput {
  whatsapp?: string | null;
  user_id?: string | null;
  email?: string | null;
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

/** Devuelve el teléfono efectivo del coach y de dónde salió. */
export function resolveCoachPhone(
  coach: CoachContactInput,
  alumnos: AlumnoContactRow[] = [],
): { phone: string; source: CoachPhoneSource } {
  const explicit = (coach.whatsapp || "").trim();
  if (explicit) return { phone: explicit, source: "coach" };

  const byUserId = coach.user_id
    ? alumnos.find((a) => a.user_id && a.user_id === coach.user_id && (a.telefono || "").trim())
    : undefined;
  if (byUserId) return { phone: String(byUserId.telefono).trim(), source: "alumno_user_id" };

  const coachEmail = normalizeEmail(coach.email);
  if (coachEmail) {
    const byEmail = alumnos.find(
      (a) => normalizeEmail(a.email) === coachEmail && (a.telefono || "").trim(),
    );
    if (byEmail) return { phone: String(byEmail.telefono).trim(), source: "alumno_email" };
  }

  return { phone: "", source: "none" };
}

/** Orden preferido de grupos; el resto se agrega alfabéticamente. */
export const GRUPOS_BASE = [
  "G1",
  "G2",
  "G3",
  "G4",
  "Principiante",
  "Aspirantes",
  "Personalizado",
] as const;

const EXCLUIDOS = new Set(["sin grupo", ""]);

/**
 * Combina los grupos base con los grupos reales existentes en `alumnos.grupo`
 * (y los ya asignados al coach), sin duplicados ni "Sin grupo"/null.
 */
export function buildGrupoOptions(existentes: (string | null | undefined)[] = []): string[] {
  const seen = new Map<string, string>();
  for (const g of GRUPOS_BASE) seen.set(g.toLowerCase(), g);

  const extras: string[] = [];
  for (const raw of existentes) {
    const g = (raw || "").trim();
    if (!g || EXCLUIDOS.has(g.toLowerCase())) continue;
    const key = g.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, g);
    extras.push(g);
  }
  extras.sort((a, b) => a.localeCompare(b, "es"));
  return [...GRUPOS_BASE, ...extras];
}
