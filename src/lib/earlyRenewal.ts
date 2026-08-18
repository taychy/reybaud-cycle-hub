/**
 * Renovación anticipada de planes.
 *
 * Permite que el alumno pague el "próximo período" cuando su plan vigente
 * está a ≤10 días de vencerse. Las fechas del nuevo período se calculan
 * a partir de la fecha_fin actual (sin gaps, sin solapamientos).
 *
 * IMPORTANTE (bug histórico): este contexto vive en localStorage y, si el
 * alumno abandonaba el checkout, quedaba guardado para siempre. Al volver a
 * pagar semanas después el sistema creaba una suscripción del MES PASADO y
 * salteaba la pendiente del mes correcto (caso Federico Miño). Por eso ahora:
 *   - el contexto tiene timestamp y TTL (24h),
 *   - se descarta si su fechaInicio es anterior al mes en curso,
 *   - se puede revalidar contra la suscripción vigente real.
 *
 * Flags en localStorage:
 *   alumno_renewal                       = "1"   (compatibilidad con flujo existente)
 *   alumno_early_renewal                 = "1"
 *   alumno_early_renewal_sub_id          = uuid de la sub vigente
 *   alumno_early_renewal_plan_id         = plan_id actual (para detectar cambio de plan)
 *   alumno_early_renewal_fecha_inicio    = YYYY-MM-DD (día 1 del mes siguiente)
 *   alumno_early_renewal_fecha_fin       = YYYY-MM-DD (último día de ese mes)
 *   alumno_early_renewal_auto_renov      = "1" | "0" (estado actual de auto-renovación)
 *   alumno_early_renewal_ts              = epoch ms en que se guardó el contexto
 */

import { startOfCalendarMonth } from "@/lib/subscriptionPeriod";

export const EARLY_RENEWAL_WINDOW_DAYS = 20;

/** Vida útil del contexto guardado en localStorage. */
export const EARLY_RENEWAL_TTL_MS = 24 * 60 * 60 * 1000;

const K_FLAG = "alumno_early_renewal";
const K_SUB = "alumno_early_renewal_sub_id";
const K_PLAN = "alumno_early_renewal_plan_id";
const K_INI = "alumno_early_renewal_fecha_inicio";
const K_FIN = "alumno_early_renewal_fecha_fin";
const K_AR = "alumno_early_renewal_auto_renov";
const K_TS = "alumno_early_renewal_ts";

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Calcula el próximo período a partir de la fecha_fin actual (sin gaps). */
export function computeNextPeriodFromFechaFin(fechaFin: string): {
  fechaInicio: string;
  fechaFin: string;
} {
  // Regla de negocio: el período nuevo SIEMPRE arranca el día 1 del mes
  // siguiente al del período vigente (nunca se encadena "fin + 1 día", que
  // arrastraría para siempre el corrimiento de la primera compra).
  const [y, m] = fechaFin.substring(0, 10).split("-").map(Number);
  const inicio = new Date(y, m, 1); // día 1 del mes siguiente
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
  localStorage.setItem(K_TS, String(Date.now()));
}

export interface EarlyRenewalContext {
  subId: string;
  planId: string;
  fechaInicio: string;
  fechaFin: string;
  autoRenovacion: boolean;
  /** epoch ms en que se guardó el contexto */
  createdAt: number;
}

/**
 * Devuelve el contexto de renovación anticipada SOLO si sigue siendo válido.
 * Si venció (TTL) o apunta a un período pasado, limpia localStorage y devuelve null.
 */
export function getEarlyRenewal(): EarlyRenewalContext | null {
  if (typeof localStorage === "undefined") return null;
  if (localStorage.getItem(K_FLAG) !== "1") return null;
  const subId = localStorage.getItem(K_SUB) || "";
  const planId = localStorage.getItem(K_PLAN) || "";
  const fechaInicio = localStorage.getItem(K_INI) || "";
  const fechaFin = localStorage.getItem(K_FIN) || "";
  if (!subId || !fechaInicio || !fechaFin) {
    clearEarlyRenewal();
    return null;
  }

  // 1) TTL. Los contextos legacy (sin timestamp) se consideran vencidos.
  const rawTs = localStorage.getItem(K_TS);
  const createdAt = rawTs ? Number(rawTs) : NaN;
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > EARLY_RENEWAL_TTL_MS) {
    clearEarlyRenewal();
    return null;
  }

  // 2) Validación semántica: nunca puede apuntar a un mes ya empezado o pasado.
  if (fechaInicio.substring(0, 10) < startOfCalendarMonth()) {
    clearEarlyRenewal();
    return null;
  }

  return {
    subId,
    planId,
    fechaInicio,
    fechaFin,
    autoRenovacion: localStorage.getItem(K_AR) === "1",
    createdAt,
  };
}

/**
 * Revalida el contexto contra las suscripciones vigentes reales del alumno.
 * Si `vigentesSubIds` es null/undefined (no pudimos consultar), no toca nada:
 * nunca rompemos el flujo normal por un problema de red.
 * Devuelve el contexto si sigue siendo válido, o null si lo descartó.
 */
export function revalidateEarlyRenewalSource(
  ctx: EarlyRenewalContext | null,
  vigentesSubIds: string[] | null | undefined,
): EarlyRenewalContext | null {
  if (!ctx) return null;
  if (!vigentesSubIds) return ctx;
  if (vigentesSubIds.includes(ctx.subId)) return ctx;
  clearEarlyRenewal();
  return null;
}

export function clearEarlyRenewal() {
  localStorage.removeItem(K_FLAG);
  localStorage.removeItem(K_SUB);
  localStorage.removeItem(K_PLAN);
  localStorage.removeItem(K_INI);
  localStorage.removeItem(K_FIN);
  localStorage.removeItem(K_AR);
  localStorage.removeItem(K_TS);
}

/** Formatea una fecha YYYY-MM-DD como DD/MM/YYYY sin drift de timezone. */
export function formatLocalDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.substring(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
