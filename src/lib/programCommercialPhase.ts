/**
 * Máquina de estados comerciales de un programa de formación.
 * Misma regla que la función SQL `program_commercial_phase` (migración 0014).
 *
 *  preinscripcion  → inicio_preinscripcion <= hoy <= fin_preinscripcion
 *  espera_apertura → todavía no empezó la inscripción
 *  inscripcion     → inicio_inscripcion <= hoy <= fin_inscripcion
 *  lista_espera    → fuera de la ventana de inscripción
 *
 * Fallback legacy: si no hay fechas nuevas, fin_inscripcion = fecha_cierre_inscripcion.
 * Por sede: en fase inscripcion, una sede sin cupo pasa a lista de espera.
 */
import { todayISO, findStageVigente, type ProgramStageLike } from "./programEnrollment";

export type CommercialPhase = "preinscripcion" | "espera_apertura" | "inscripcion" | "lista_espera";

export interface ProgramDatesLike {
  fecha_inicio_preinscripcion?: string | null;
  fecha_fin_preinscripcion?: string | null;
  fecha_inicio_inscripcion?: string | null;
  fecha_fin_inscripcion?: string | null;
  fecha_cierre_inscripcion?: string | null;
}

export interface ProgramSedeLike {
  sede_id: string;
  nombre?: string | null;
  activa?: boolean | null;
  dia_semana?: number | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  cupo_maximo?: number | null;
  inscriptos?: number | null;
}

export const PHASE_LABELS: Record<CommercialPhase, string> = {
  preinscripcion: "Preinscripción",
  espera_apertura: "Esperando apertura de inscripción",
  inscripcion: "Inscripción abierta",
  lista_espera: "Lista de espera",
};

export function hasCommercialDates(p: ProgramDatesLike | null | undefined): boolean {
  return !!(p?.fecha_inicio_preinscripcion || p?.fecha_fin_preinscripcion || p?.fecha_inicio_inscripcion || p?.fecha_fin_inscripcion);
}

export function resolveCommercialPhase(
  p: ProgramDatesLike | null | undefined,
  day: string = todayISO(),
): CommercialPhase {
  const preIni = p?.fecha_inicio_preinscripcion || null;
  const preFin = p?.fecha_fin_preinscripcion || null;
  const insIni = p?.fecha_inicio_inscripcion || null;
  const insFin = p?.fecha_fin_inscripcion || p?.fecha_cierre_inscripcion || null;
  if (preIni && preFin && preIni <= day && day <= preFin) return "preinscripcion";
  if (insIni && day < insIni) return "espera_apertura";
  if ((!insIni || day >= insIni) && (!insFin || day <= insFin)) return "inscripcion";
  return "lista_espera";
}

export function sedeCuposLibres(s: ProgramSedeLike): number {
  if (s.cupo_maximo == null) return Infinity;
  return Math.max(0, Number(s.cupo_maximo) - Number(s.inscriptos ?? 0));
}

/** Fase efectiva de una sede: en inscripción, sin cupo → lista_espera. */
export function sedePhase(phase: CommercialPhase, s: ProgramSedeLike): CommercialPhase {
  if (phase === "inscripcion" && sedeCuposLibres(s) <= 0) return "lista_espera";
  return phase;
}

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function fmtSedeHorario(s: ProgramSedeLike): string {
  const dia = s.dia_semana != null ? DIAS_SEMANA[s.dia_semana] : null;
  const hi = s.hora_inicio?.slice(0, 5);
  const hf = s.hora_fin?.slice(0, 5);
  const horas = hi ? (hf ? `${hi} a ${hf} h` : `${hi} h`) : null;
  return [dia, horas].filter(Boolean).join(" · ") || "Horario a confirmar";
}

export interface ReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}

/** Validaciones previas a abrir la inscripción (playbook). Sin efectos ni envíos. */
export function inscriptionReadiness(input: {
  program: ProgramDatesLike & { activo?: boolean | null; landing_public?: boolean | null; cohort_slug?: string | null };
  sedes: ProgramSedeLike[];
  stages: ProgramStageLike[];
}): ReadinessCheck[] {
  const { program, sedes, stages } = input;
  const ini = program.fecha_inicio_inscripcion || null;
  const fin = program.fecha_fin_inscripcion || null;
  const fechasOk = !!ini && !!fin && ini <= fin &&
    (!program.fecha_fin_preinscripcion || program.fecha_fin_preinscripcion <= ini);
  const activas = sedes.filter((s) => s.activa !== false);
  const sedesIncompletas = activas.filter((s) => !s.hora_inicio || s.dia_semana == null || !(Number(s.cupo_maximo) > 0));
  const activeStages = stages.filter((s) => s.activo !== false);
  const stageOk = !!ini && (
    !!findStageVigente(activeStages, ini) ||
    activeStages.some((s) => (!fin || s.fecha_desde <= fin) && s.fecha_hasta >= ini)
  );
  return [
    { key: "fechas", label: "Fechas de inscripción válidas", ok: fechasOk,
      detail: fechasOk ? undefined : "Configurá inicio y fin de inscripción (inicio ≤ fin, después de la preinscripción)." },
    { key: "sede_activa", label: "Al menos una sede activa", ok: activas.length > 0 },
    { key: "sedes_completas", label: "Cada sede activa tiene día, horario y cupo > 0", ok: activas.length > 0 && sedesIncompletas.length === 0,
      detail: sedesIncompletas.length ? `Incompletas: ${sedesIncompletas.map((s) => s.nombre || s.sede_id).join(", ")}` : undefined },
    { key: "precio", label: "Etapa de precio vigente para la ventana de inscripción", ok: stageOk },
    { key: "landing", label: "Landing pública activa", ok: program.activo !== false && program.landing_public === true && !!program.cohort_slug },
    { key: "checkout", label: "Checkout disponible (Mercado Pago / transferencia)", ok: program.activo !== false && program.landing_public === true && stageOk,
      detail: "El flujo de pago actual requiere programa activo, landing pública y precio vigente." },
  ];
}
