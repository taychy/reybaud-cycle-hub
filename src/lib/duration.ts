/**
 * Unidad canónica de duración en toda la app: MINUTOS (entero).
 *
 * Campos reales en DB (auditados):
 * - `sesiones_extra.duracion_minutos` (integer, minutos)
 * - `servicios_turnera.duracion_minutos` (integer, minutos)
 * - `movimientos_liquidacion.duracion` (integer, minutos — hoy siempre NULL)
 * No existe hoy ningún campo de duración en `entrenamientos`: la duración
 * planificada vive como texto dentro de `descripcion`. Tampoco hay
 * integraciones tipo Garmin/Strava (no hay elapsed_time / moving_time).
 *
 * Regla semántica: si existe duración REAL registrada (sesión realizada),
 * esa gana; si no, se usa la planificada. `duracionEfectiva` implementa eso.
 */

/** Normaliza un valor crudo a minutos enteros válidos, o null. */
export function toMinutos(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return Math.round(n);
}

/**
 * Formato humano y consistente: "45 min", "1 h", "1 h 30 min", "2 días 3 h".
 * Nunca devuelve "0 h", "NaN" ni negativos: en esos casos devuelve `fallback`.
 */
export function formatDuracion(minutos: unknown, fallback = "—"): string {
  const m = toMinutos(minutos);
  if (m === null) return fallback;
  const dias = Math.floor(m / 1440);
  const horas = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  const partes: string[] = [];
  if (dias > 0) partes.push(`${dias} ${dias === 1 ? "día" : "días"}`);
  if (horas > 0) partes.push(`${horas} h`);
  if (mins > 0) partes.push(`${mins} min`);
  return partes.join(" ");
}

/** Formato corto para badges: "45 min" / "1 h 30" / "2 h". */
export function formatDuracionCorta(minutos: unknown, fallback = "—"): string {
  const m = toMinutos(minutos);
  if (m === null) return fallback;
  if (m < 60) return `${m} min`;
  const horas = Math.floor(m / 60);
  const mins = m % 60;
  return mins === 0 ? `${horas} h` : `${horas} h ${mins}`;
}

/** Suma en la unidad canónica (minutos), ignorando nulos/inválidos. */
export function sumarMinutos(valores: unknown[]): number {
  return valores.reduce<number>((acc, v) => acc + (toMinutos(v) ?? 0), 0);
}

/**
 * Duración a mostrar para una sesión.
 * Completada => duración real; pendiente/programada => planificada.
 */
export function duracionEfectiva(opts: {
  realizada?: boolean;
  duracionRealMin?: unknown;
  duracionPlanificadaMin?: unknown;
}): number | null {
  const real = toMinutos(opts.duracionRealMin);
  const plan = toMinutos(opts.duracionPlanificadaMin);
  if (opts.realizada) return real ?? plan;
  return plan ?? real;
}
