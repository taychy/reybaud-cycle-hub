/**
 * Control de acceso a entrenamientos.
 *
 * El grupo NO otorga acceso por sí solo: un alumno inactivo/bloqueado/pendiente
 * o cuya única mensualidad fue cancelada no debe ver entrenamientos, aunque
 * conserve su grupo asignado (el grupo y el historial se preservan).
 *
 * Esta es la réplica en cliente de `public.alumno_puede_ver_entrenamientos`,
 * que aplica la misma regla en RLS y en `get_entrenamientos_semana_alumno`.
 */

export const ESTADOS_CON_ENTRENAMIENTOS = ["activo", "vacaciones"] as const;

export const SUSCRIPCION_ESTADOS_CON_ENTRENAMIENTOS = [
  "activa",
  "pendiente_verificacion",
  "pendiente",
  "vencida",
] as const;

export function estadoPermiteEntrenamientos(estado: string | null | undefined): boolean {
  return !!estado && (ESTADOS_CON_ENTRENAMIENTOS as readonly string[]).includes(estado);
}

export interface SuscripcionAcceso {
  estado?: string | null;
  cancelada_at?: string | null;
}

export function suscripcionPermiteEntrenamientos(sub: SuscripcionAcceso): boolean {
  if (sub.cancelada_at) return false;
  return (
    !!sub.estado &&
    (SUSCRIPCION_ESTADOS_CON_ENTRENAMIENTOS as readonly string[]).includes(sub.estado)
  );
}

/** Regla completa: estado del alumno + al menos una suscripción no cancelada vigente. */
export function puedeVerEntrenamientos(
  estado: string | null | undefined,
  suscripciones: SuscripcionAcceso[] | null | undefined,
): boolean {
  if (!estadoPermiteEntrenamientos(estado)) return false;
  return (suscripciones || []).some(suscripcionPermiteEntrenamientos);
}
