/**
 * Calendar-month subscription period helpers.
 *
 * Business rule: todas las suscripciones mensuales cierran el último día
 * del mes calendario de la fecha de inicio. No se permite "30 días rolling".
 * Si se paga el 09/06, la sub vence el 30/06 (no el 08/07).
 */

/**
 * Devuelve el último día (YYYY-MM-DD, hora local) del mes calendario de la fecha dada.
 * Acepta un string YYYY-MM-DD o un Date. Si no se pasa nada, usa hoy.
 */
export function endOfCalendarMonth(input?: string | Date): string {
  let y: number;
  let m: number; // 1-12
  if (!input) {
    const d = new Date();
    y = d.getFullYear();
    m = d.getMonth() + 1;
  } else if (typeof input === "string") {
    const [ys, ms] = input.substring(0, 10).split("-");
    y = parseInt(ys, 10);
    m = parseInt(ms, 10);
  } else {
    y = input.getFullYear();
    m = input.getMonth() + 1;
  }
  // Day 0 del mes siguiente = último día del mes actual
  const last = new Date(y, m, 0);
  const ystr = String(last.getFullYear());
  const mstr = String(last.getMonth() + 1).padStart(2, "0");
  const dstr = String(last.getDate()).padStart(2, "0");
  return `${ystr}-${mstr}-${dstr}`;
}

/**
 * Primer día (YYYY-MM-DD) del mes calendario de la fecha dada (hoy por defecto).
 * Regla de negocio: TODA suscripción mensual arranca el día 1 del mes,
 * sin importar el día en que se paga ni si es la primera compra.
 */
export function startOfCalendarMonth(input?: string | Date): string {
  let y: number;
  let m: number; // 1-12
  if (!input) {
    const d = new Date();
    y = d.getFullYear();
    m = d.getMonth() + 1;
  } else if (typeof input === "string") {
    const [ys, ms] = input.substring(0, 10).split("-");
    y = parseInt(ys, 10);
    m = parseInt(ms, 10);
  } else {
    y = input.getFullYear();
    m = input.getMonth() + 1;
  }
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Período calendario completo (día 1 → último día) del mes de la fecha dada. */
export function calendarMonthPeriod(input?: string | Date): { fechaInicio: string; fechaFin: string } {
  const fechaInicio = startOfCalendarMonth(input);
  return { fechaInicio, fechaFin: endOfCalendarMonth(fechaInicio) };
}

/** Período siguiente al que termina en `fechaFin`: siempre el día 1 del mes próximo. */
export function nextCalendarMonthPeriod(fechaFin: string): { fechaInicio: string; fechaFin: string } {
  const [y, m] = fechaFin.substring(0, 10).split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return calendarMonthPeriod(`${nextY}-${String(nextM).padStart(2, "0")}-01`);
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

export interface PurchasePeriod {
  fechaInicio: string;
  fechaFin: string;
  reason: PurchasePeriodReason;
}

function lastDayOfMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
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
  today?: Date;
  earlyRenewalPeriod?: { fechaInicio: string; fechaFin: string } | null;
  coveredUntil?: string | null;
}): PurchasePeriod {
  const today = opts?.today ?? new Date();
  const current = calendarMonthPeriod(today);

  const early = opts?.earlyRenewalPeriod;
  if (early?.fechaInicio && early.fechaInicio > current.fechaInicio) {
    return { fechaInicio: early.fechaInicio, fechaFin: early.fechaFin, reason: "early_renewal" };
  }

  const covered = opts?.coveredUntil?.substring(0, 10);
  if (covered && covered >= current.fechaFin) {
    const next = nextCalendarMonthPeriod(current.fechaFin);
    return { ...next, reason: "covered_current_month" };
  }

  if (today.getDate() > lastDayOfMonth(today) - LATE_MONTH_DAYS) {
    const next = nextCalendarMonthPeriod(current.fechaFin);
    return { ...next, reason: "late_month" };
  }

  return { ...current, reason: "current_month" };
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "septiembre 2026" a partir de un YYYY-MM-DD, sin drift de zona horaria. */
export function monthLabel(iso: string): string {
  const [y, m] = iso.substring(0, 10).split("-").map(Number);
  if (!y || !m) return "";
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

