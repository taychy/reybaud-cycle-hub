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
