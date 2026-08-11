/**
 * Lógica ÚNICA de apertura/cierre de inscripciones de un programa cerrado.
 *
 * Se usa tanto en la landing pública (`FormacionInicial.tsx`) como en el panel
 * admin (`AdminProgramaDetalle` / `EditProgramaDialog`) para que nunca haya dos
 * reglas distintas. Replica exactamente lo que hacen en el backend
 * `get_public_program` + `get_plan_current_price` + `enroll-programa`.
 *
 * Una inscripción está ABIERTA si y sólo si:
 *  1. el plan está activo y con landing pública habilitada,
 *  2. quedan cupos libres (max_inscripciones - inscripciones_actuales > 0),
 *  3. hoy <= fecha_cierre_inscripcion,
 *  4. existe una etapa de precio ACTIVA que cubra la fecha de hoy.
 */

export interface ProgramStageLike {
  id?: string;
  nombre?: string | null;
  precio: number | string;
  precio_cuota?: number | string | null;
  cuotas_cantidad?: number | null;
  fecha_desde: string;
  fecha_hasta: string;
  activo?: boolean | null;
}

export interface ProgramLike {
  activo?: boolean | null;
  landing_public?: boolean | null;
  max_inscripciones?: number | null;
  inscripciones_actuales?: number | null;
  fecha_cierre_inscripcion?: string | null;
}

export interface EnrollmentStatus {
  abiertas: boolean;
  cuposMax: number;
  cuposUsados: number;
  cuposLibres: number;
  fechaCierre: string | null;
  cierreVencido: boolean;
  stageVigente: ProgramStageLike | null;
  /** Razones por las que están cerradas (vacío si están abiertas). */
  motivos: string[];
}

/** Fecha de hoy en formato ISO (YYYY-MM-DD), hora local. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Devuelve la etapa activa que cubre `day` (misma regla que get_plan_current_price). */
export function findStageVigente(
  stages: ProgramStageLike[] | null | undefined,
  day: string = todayISO(),
): ProgramStageLike | null {
  return (
    (stages || []).find(
      (s) => s.activo !== false && s.fecha_desde <= day && day <= s.fecha_hasta,
    ) || null
  );
}

/** Última fecha_hasta entre las etapas activas. */
export function lastActiveStageEnd(stages: ProgramStageLike[] | null | undefined): string | null {
  const activas = (stages || []).filter((s) => s.activo !== false);
  if (activas.length === 0) return null;
  return activas.reduce((max, s) => (s.fecha_hasta > max ? s.fecha_hasta : max), activas[0].fecha_hasta);
}

export function computeEnrollmentStatus(
  program: ProgramLike | null | undefined,
  stages: ProgramStageLike[] | null | undefined,
  day: string = todayISO(),
): EnrollmentStatus {
  const cuposMax = Number(program?.max_inscripciones ?? 0) || 0;
  const cuposUsados = Number(program?.inscripciones_actuales ?? 0) || 0;
  const cuposLibres = cuposMax > 0 ? Math.max(0, cuposMax - cuposUsados) : Infinity;
  const fechaCierre = program?.fecha_cierre_inscripcion || null;
  const cierreVencido = !!fechaCierre && day > fechaCierre;
  const stageVigente = findStageVigente(stages, day);

  const motivos: string[] = [];
  if (program?.activo === false) motivos.push("El programa está inactivo.");
  if (program?.landing_public === false) motivos.push("La landing pública está desactivada.");
  if (cuposLibres <= 0) motivos.push("No quedan cupos disponibles.");
  if (cierreVencido) motivos.push(`La fecha de cierre de inscripciones (${fechaCierre}) ya pasó.`);
  if (!stageVigente) motivos.push("No hay una etapa de precio activa vigente para hoy.");

  return {
    abiertas: motivos.length === 0,
    cuposMax,
    cuposUsados,
    cuposLibres: cuposLibres === Infinity ? Infinity : cuposLibres,
    fechaCierre,
    cierreVencido,
    stageVigente,
    motivos,
  };
}

// ---------- Formateo de fechas en español argentino ----------

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** "15 de agosto" */
export function fmtDiaMesAR(iso: string | null | undefined): string {
  if (!iso) return "—";
  return parseISO(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long" });
}

/** "Sábado 15 de agosto" */
export function fmtDiaSemanaAR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = parseISO(iso).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "15 de agosto de 2026" */
export function fmtFechaLargaAR(iso: string | null | undefined): string {
  if (!iso) return "—";
  return parseISO(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

/** Cantidad de semanas (redondeada) entre dos fechas inclusive. */
export function semanasEntre(desde: string | null | undefined, hasta: string | null | undefined): number | null {
  if (!desde || !hasta) return null;
  const diff = parseISO(hasta).getTime() - parseISO(desde).getTime();
  if (diff < 0) return null;
  return Math.round(diff / (7 * 86_400_000)) + 1;
}

/** Suma días a una fecha ISO devolviendo ISO. */
export function addDaysISO(iso: string, days: number): string {
  const dt = parseISO(iso);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
