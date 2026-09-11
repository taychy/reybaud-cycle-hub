/**
 * Calendar-month subscription period helpers.
 *
 * Business rule: todas las suscripciones mensuales cierran el último día
 * del mes calendario de la fecha de inicio. No se permite "30 días rolling".
 * Si se paga el 09/06, la sub vence el 30/06 (no el 08/07).
 *
 * Todas las fechas "hoy" se resuelven en la zona de negocio
 * (America/Argentina/Buenos_Aires), nunca en UTC ni en la zona del navegador.
 */

import { businessDateParts, businessToday, daysInMonth, isoDateParts } from "@/lib/businessTime";

function partsOf(input?: string | Date) {
  if (!input) return businessDateParts();
  if (typeof input === "string") return isoDateParts(input);
  return businessDateParts(input);
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Devuelve el último día (YYYY-MM-DD) del mes calendario de la fecha dada.
 * Acepta un string YYYY-MM-DD o un Date. Si no se pasa nada, usa hoy (zona de negocio).
 */
export function endOfCalendarMonth(input?: string | Date): string {
  const { year, month } = partsOf(input);
  return `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
}

/**
 * Primer día (YYYY-MM-DD) del mes calendario de la fecha dada (hoy por defecto).
 * Regla de negocio: TODA suscripción mensual arranca el día 1 del mes,
 * sin importar el día en que se paga ni si es la primera compra.
 */
export function startOfCalendarMonth(input?: string | Date): string {
  const { year, month } = partsOf(input);
  return `${year}-${pad(month)}-01`;
}

/** Período calendario completo (día 1 → último día) del mes de la fecha dada. */
export function calendarMonthPeriod(input?: string | Date): { fechaInicio: string; fechaFin: string } {
  const fechaInicio = startOfCalendarMonth(input);
  return { fechaInicio, fechaFin: endOfCalendarMonth(fechaInicio) };
}

/** Período siguiente al que termina en `fechaFin`: siempre el día 1 del mes próximo. */
export function nextCalendarMonthPeriod(fechaFin: string): { fechaInicio: string; fechaFin: string } {
  const { year, month } = isoDateParts(fechaFin);
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  return calendarMonthPeriod(`${nextY}-${pad(nextM)}-01`);
}

/**
 * Días finales del mes en los que una compra se interpreta como del mes SIGUIENTE.
 * Caso Laura Palermo: pagó el 31/08 su vuelta a la escuela y el sistema le imputó
 * agosto completo (que ya estaba terminando) en vez de septiembre.
 */
export const LATE_MONTH_DAYS = 2;

export type PurchasePeriodReason =
  | "early_renewal"
  | "covered_current_month"
  | "late_month"
  | "current_month";

/** Intención explícita del flujo que inició la compra. */
export type PurchaseIntent = "buy_now" | "renew_next_period";

export interface PurchasePeriod {
  fechaInicio: string;
  fechaFin: string;
  reason: PurchasePeriodReason;
  intent: PurchaseIntent;
}

/**
 * Fuente de verdad del período que el alumno está comprando.
 *
 * Reglas, en orden:
 *  1. Contexto explícito de renovación anticipada apuntando a un mes futuro → ese período.
 *  2. El alumno ya tiene cubierto el mes en curso (`coveredUntil` llega al fin de mes)
 *     → está comprando el mes siguiente.
 *  3. La compra ocurre en los últimos `LATE_MONTH_DAYS` días del mes → mes siguiente.
 *     Nadie compra una mensualidad que vence en uno o dos días.
 *  4. En cualquier otro caso → mes calendario en curso.
 *
 * La fecha real del pago no se toca nunca: sólo se decide el período de la obligación.
 */
export function resolvePurchasePeriod(opts?: {
  /** Instante (o fecha YYYY-MM-DD) de la compra. Se interpreta en zona de negocio. */
  today?: Date | string;
  earlyRenewalPeriod?: { fechaInicio: string; fechaFin: string } | null;
  coveredUntil?: string | null;
}): PurchasePeriod {
  const todayIso =
    typeof opts?.today === "string"
      ? opts.today.substring(0, 10)
      : businessToday(opts?.today ?? new Date());
  const current = calendarMonthPeriod(todayIso);

  const early = opts?.earlyRenewalPeriod;
  if (early?.fechaInicio && early.fechaInicio > current.fechaInicio) {
    return {
      fechaInicio: early.fechaInicio,
      fechaFin: early.fechaFin,
      reason: "early_renewal",
      intent: "renew_next_period",
    };
  }

  const covered = opts?.coveredUntil?.substring(0, 10);
  if (covered && covered >= current.fechaFin) {
    const next = nextCalendarMonthPeriod(current.fechaFin);
    return { ...next, reason: "covered_current_month", intent: "renew_next_period" };
  }

  const { year, month, day } = isoDateParts(todayIso);
  if (day > daysInMonth(year, month) - LATE_MONTH_DAYS) {
    const next = nextCalendarMonthPeriod(current.fechaFin);
    return { ...next, reason: "late_month", intent: "renew_next_period" };
  }

  return { ...current, reason: "current_month", intent: "buy_now" };
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "septiembre 2026" a partir de un YYYY-MM-DD, sin drift de zona horaria. */
export function monthLabel(iso: string): string {
  const { year, month } = isoDateParts(iso);
  if (!year || !month) return "";
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
