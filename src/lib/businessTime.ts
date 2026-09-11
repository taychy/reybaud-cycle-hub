/**
 * Zona horaria de negocio.
 *
 * Toda decisión de "qué día es hoy" y "qué mes se está comprando" debe usar
 * America/Argentina/Buenos_Aires. Nunca UTC (`toISOString()`) ni la zona del
 * navegador: un pago hecho el 31/08 a las 21:48 en Argentina es 01/09 en UTC,
 * y eso hacía que el sistema imputara el mes equivocado (caso Laura Palermo).
 */

export const BUSINESS_TZ = "America/Argentina/Buenos_Aires";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha de negocio (YYYY-MM-DD) para el instante dado (por defecto, ahora). */
export function businessToday(now: Date = new Date()): string {
  return dateFmt.format(now);
}

export interface BusinessDateParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
}

/** Partes de la fecha de negocio para el instante dado. */
export function businessDateParts(now: Date = new Date()): BusinessDateParts {
  const [y, m, d] = businessToday(now).split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** Partes de una fecha ya expresada como YYYY-MM-DD (sin construir Date). */
export function isoDateParts(iso: string): BusinessDateParts {
  const [y, m, d] = iso.substring(0, 10).split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** Último día (número) del mes indicado. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
