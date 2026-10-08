/**
 * Control de acceso a entrenamientos.
 *
 * El grupo NO otorga acceso por sí solo. Réplica en cliente de
 * `public.alumno_puede_ver_entrenamientos` (RLS de `entrenamientos` y RPCs):
 * - alumno en estado activo/vacaciones, y
 * - al menos una suscripción con estado EFECTIVO activa / pendiente_verificacion
 *   / pago_pendiente (gracia día 1-5). Acceso pausado o deuda → sin acceso.
 * - Staff (rol real admin/coach) no queda restringido por deuda de su ficha.
 */
import { getEffectiveSubStatus, type SubStatusInput } from "./subscriptionStatus";

export const ESTADOS_CON_ENTRENAMIENTOS = ["activo", "vacaciones"] as const;

export const EFECTIVOS_CON_ENTRENAMIENTOS = ["activa", "pendiente_verificacion", "pago_pendiente"] as const;

export function estadoPermiteEntrenamientos(estado: string | null | undefined): boolean {
  return !!estado && (ESTADOS_CON_ENTRENAMIENTOS as readonly string[]).includes(estado);
}

export type SuscripcionAcceso = Partial<SubStatusInput> & { estado?: string | null };

export function suscripcionPermiteEntrenamientos(sub: SuscripcionAcceso): boolean {
  if (!sub.estado) return false;
  const eff = getEffectiveSubStatus({ ...sub, estado: sub.estado, fecha_fin: sub.fecha_fin ?? null });
  return (EFECTIVOS_CON_ENTRENAMIENTOS as readonly string[]).includes(eff);
}

export function puedeVerEntrenamientos(
  estado: string | null | undefined,
  suscripciones: SuscripcionAcceso[] | null | undefined,
  opts: { esStaff?: boolean } = {},
): boolean {
  if (opts.esStaff) return true;
  if (!estadoPermiteEntrenamientos(estado)) return false;
  return (suscripciones || []).some(suscripcionPermiteEntrenamientos);
}

/** Columnas de suscripciones necesarias para calcular el acceso efectivo. */
export const SUB_ACCESS_COLUMNS = "estado, fecha_inicio, fecha_fin, cancelada_at, cancelada_motivo, mp_status, origen_registro";
