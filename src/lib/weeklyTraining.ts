/**
 * Fuente única de verdad para "qué entrenamientos le corresponden a un alumno"
 * en una semana. La usan el dashboard del alumno, su progreso y el resumen
 * semanal por email (a través del RPC `get_entrenamientos_semana_alumno`,
 * que replica exactamente estas mismas reglas en la base).
 *
 * Regla vigente:
 *  - grupo "Personalizado" o "Aspirantes"  -> entrenamientos con alumno_id = alumno
 *  - resto de los grupos (G1..G4, etc.)    -> entrenamientos del grupo y sin alumno_id
 *  - siempre visible = true
 */

export const PERSONAL_SCOPE_GRUPOS = ["Personalizado", "Aspirantes"] as const;

export function isPersonalScope(grupo: string | null | undefined): boolean {
  return !!grupo && (PERSONAL_SCOPE_GRUPOS as readonly string[]).includes(grupo);
}

/** Aplica el filtro de asignación (individual vs grupo) a una query de `entrenamientos`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyTrainingScope(query: any, grupo: string | null | undefined, alumnoId: string): any {
  if (isPersonalScope(grupo)) {
    return query.eq("alumno_id", alumnoId);
  }
  return query.eq("grupo", grupo).is("alumno_id", null);
}

/* ------------------------- Semanas (America/Argentina/Buenos_Aires) ------------------------- */

const AR_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3 estable

function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

/** Fecha de hoy (YYYY-MM-DD) en horario de Argentina. */
export function arTodayISO(now: Date = new Date()): string {
  return toISO(new Date(now.getTime() - AR_OFFSET_MS));
}

export interface WeekRange {
  inicio: string;
  fin: string;
  dates: string[];
}

/**
 * Semana lunes→domingo que contiene `baseISO`, desplazada `offsetWeeks`.
 * offsetWeeks = 0 -> esta semana, 1 -> próxima semana.
 */
export function weekRangeAR(baseISO: string, offsetWeeks = 0): WeekRange {
  const [y, m, d] = baseISO.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dow = base.getUTCDay(); // 0 = domingo
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - (dow === 0 ? 6 : dow - 1) + offsetWeeks * 7);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    dates.push(toISO(day));
  }
  return { inicio: dates[0], fin: dates[6], dates };
}

/** Semana siguiente respecto de hoy (la que se envía el domingo 18:00). */
export function nextWeekRangeAR(now: Date = new Date()): WeekRange {
  return weekRangeAR(arTodayISO(now), 1);
}

/* ------------------------------------- Email ------------------------------------- */

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Alumnos elegibles para el envío automático semanal. */
export function isEligibleForAutoDigest(alumno: {
  estado?: string | null;
  email?: string | null;
  recibe_entrenamientos_email?: boolean | null;
}): boolean {
  return (
    alumno.recibe_entrenamientos_email === true &&
    alumno.estado === "activo" &&
    isValidEmail(alumno.email)
  );
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function formatWeekLabel(range: WeekRange): string {
  const [, m1, d1] = range.inicio.split("-");
  const [, m2, d2] = range.fin.split("-");
  const mes1 = MESES[Number(m1) - 1];
  const mes2 = MESES[Number(m2) - 1];
  return mes1 === mes2
    ? `${Number(d1)} al ${Number(d2)} de ${mes2}`
    : `${Number(d1)} de ${mes1} al ${Number(d2)} de ${mes2}`;
}

export const WEEKLY_DIGEST_TEMPLATE = "weekly_training_digest";
