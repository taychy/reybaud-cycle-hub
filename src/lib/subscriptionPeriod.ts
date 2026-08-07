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
