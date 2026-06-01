/**
 * Renovación anticipada de planes.
 *
 * Permite que el alumno pague el "próximo período" cuando su plan vigente
 * está a ≤10 días de vencerse. Las fechas del nuevo período se calculan
 * a partir de la fecha_fin actual (sin gaps, sin solapamientos).
 *
 * Flags en localStorage:
 *   alumno_renewal                       = "1"   (compatibilidad con flujo existente)
 *   alumno_early_renewal                 = "1"
 *   alumno_early_renewal_sub_id          = uuid de la sub vigente
 *   alumno_early_renewal_plan_id         = plan_id actual (para detectar cambio de plan)
 *   alumno_early_renewal_fecha_inicio    = YYYY-MM-DD (fecha_fin actual + 1 día)
 *   alumno_early_renewal_fecha_fin       = YYYY-MM-DD (último día de ese mes)
 *   alumno_early_renewal_auto_renov      = "1" | "0" (estado actual de auto-renovación)
 */

export const EARLY_RENEWAL_WINDOW_DAYS = 20;

const K_FLAG = "alumno_early_renewal";
const K_SUB = "alumno_early_renewal_sub_id";
const K_PLAN = "alumno_early_renewal_plan_id";
const K_INI = "alumno_early_renewal_fecha_inicio";
const K_FIN = "alumno_early_renewal_fecha_fin";
const K_AR = "alumno_early_renewal_auto_renov";

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Calcula el próximo período a partir de la fecha_fin actual (sin gaps). */
export function computeNextPeriodFromFechaFin(fechaFin: string): {
  fechaInicio: string;
  fechaFin: string;
} {
  const [y, m, d] = fechaFin.substring(0, 10).split("-").map(Number);
  const inicio = new Date(y, m - 1, d + 1); // día siguiente al actual fin
  const fin = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0); // último día de ese mes
  return { fechaInicio: toISO(inicio), fechaFin: toISO(fin) };
}

/** Días hasta la fecha_fin (negativo si ya venció). null si no hay fecha. */
export function daysUntil(fechaFin: string | null | undefined): number | null {
  if (!fechaFin) return null;
  const [y, m, d] = fechaFin.substring(0, 10).split("-").map(Number);
  const fin = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((fin.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** Marca el flujo de renovación anticipada con los datos de la sub vigente. */
export function setEarlyRenewal(params: {
  subId: string;
  planId: string;
  fechaFin: string;
  autoRenovacion: boolean;
}) {
  const { fechaInicio, fechaFin } = computeNextPeriodFromFechaFin(params.fechaFin);
  localStorage.setItem(K_FLAG, "1");
  localStorage.setItem("alumno_renewal", "1");
  localStorage.setItem(K_SUB, params.subId);
  localStorage.setItem(K_PLAN, params.planId);
  localStorage.setItem(K_INI, fechaInicio);
  localStorage.setItem(K_FIN, fechaFin);
  localStorage.setItem(K_AR, params.autoRenovacion ? "1" : "0");
}

export interface EarlyRenewalContext {
  subId: string;
  planId: string;
  fechaInicio: string;
  fechaFin: string;
  autoRenovacion: boolean;
}

export function getEarlyRenewal(): EarlyRenewalContext | null {
  if (typeof localStorage === "undefined") return null;
  if (localStorage.getItem(K_FLAG) !== "1") return null;
  const subId = localStorage.getItem(K_SUB) || "";
  const planId = localStorage.getItem(K_PLAN) || "";
  const fechaInicio = localStorage.getItem(K_INI) || "";
  const fechaFin = localStorage.getItem(K_FIN) || "";
  if (!subId || !fechaInicio || !fechaFin) return null;
  return {
    subId,
    planId,
    fechaInicio,
    fechaFin,
    autoRenovacion: localStorage.getItem(K_AR) === "1",
  };
}

export function clearEarlyRenewal() {
  localStorage.removeItem(K_FLAG);
  localStorage.removeItem(K_SUB);
  localStorage.removeItem(K_PLAN);
  localStorage.removeItem(K_INI);
  localStorage.removeItem(K_FIN);
  localStorage.removeItem(K_AR);
}

/** Formatea una fecha YYYY-MM-DD como DD/MM/YYYY sin drift de timezone. */
export function formatLocalDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.substring(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
