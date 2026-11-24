/**
 * Clases eventuales (turnera): cada reservas_turnera es una obligación propia, nunca una mensualidad.
 * Espejo de la validación SQL `admin_register_turnera_payment` (sql/pending/0117).
 * El haber lo crea solo el trigger sync_turnera_cuenta_corriente (1 crédito por reserva):
 * este flujo nunca usa pagos_imputaciones.
 */
export const TURNERA_REF_PREFIX = "turnera:";
export const TURNERA_LABEL = "Clase eventual / Turnera";
export const MENSUALIDAD_LABEL = "Mensualidad";

export function turneraReservaIdFromRef(ref: string | null | undefined): string | null {
  const s = String(ref ?? "");
  if (!s.startsWith(TURNERA_REF_PREFIX)) return null;
  const id = s.slice(TURNERA_REF_PREFIX.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

export function isTurneraRef(ref: string | null | undefined): boolean {
  return String(ref ?? "").startsWith(TURNERA_REF_PREFIX);
}

export interface TurneraReservaLike {
  id: string;
  alumno_id: string | null;
  estado_operativo?: string | null;
  estado_economico?: string | null;
  pago_estado?: string | null;
  precio_snapshot?: number | null;
  moneda_snapshot?: string | null;
  pago_mp_payment_id?: string | null;
}

export interface TurneraMpLike {
  mp_payment_id: string;
  alumno_id?: string | null;
  currency?: string | null;
  amount?: number | null;
  external_reference?: string | null;
  suscripcion_id?: string | null;
  reservation_payment_id?: string | null;
  imputaciones_activas?: number;
}

export type TurneraPaymentCheck = { ok: true; duplicate: boolean } | { ok: false; error: string };

export const isTurneraPaid = (r: TurneraReservaLike) =>
  r.estado_economico === "pagado" || r.pago_estado === "aprobado";

export function checkTurneraPayment(input: {
  reserva: TurneraReservaLike;
  alumnoId: string;
  monto: number;
  moneda: string;
  mp?: TurneraMpLike | null;
  /** IDs de otras reservas que ya usan este mp_payment_id. */
  otherReservasWithMp?: string[];
}): TurneraPaymentCheck {
  const { reserva: r, mp } = input;
  if (r.alumno_id !== input.alumnoId) return { ok: false, error: "La reserva pertenece a otro alumno" };
  if (String(r.estado_operativo ?? "").startsWith("cancelada"))
    return { ok: false, error: "La reserva está cancelada: no se registra el pago (revisión manual)" };
  if (input.moneda.toUpperCase() !== String(r.moneda_snapshot ?? "ARS").toUpperCase())
    return { ok: false, error: "Moneda distinta a la de la reserva" };
  if (!(input.monto > 0) || input.monto !== Number(r.precio_snapshot ?? 0))
    return { ok: false, error: "El importe debe coincidir con el precio de la reserva" };
  if (mp) {
    if (isTurneraPaid(r) && r.pago_mp_payment_id === mp.mp_payment_id) return { ok: true, duplicate: true };
    if (mp.alumno_id && mp.alumno_id !== r.alumno_id) return { ok: false, error: "El cobro de Mercado Pago es de otro alumno" };
    if (String(mp.currency ?? "ARS").toUpperCase() !== input.moneda.toUpperCase()) return { ok: false, error: "Moneda del cobro distinta" };
    if (Number(mp.amount ?? 0) < input.monto) return { ok: false, error: "El cobro no alcanza el importe de la reserva" };
    const refId = turneraReservaIdFromRef(mp.external_reference);
    if (isTurneraRef(mp.external_reference) && refId !== r.id) return { ok: false, error: "El cobro corresponde a otra reserva de turnera" };
    if (mp.suscripcion_id || mp.reservation_payment_id)
      return { ok: false, error: "El cobro ya está vinculado a otra obligación: requiere revisión manual, no se modificó nada" };
    if ((mp.imputaciones_activas ?? 0) > 0)
      return { ok: false, error: "El cobro ya tiene imputaciones: riesgo de doble haber, no se modificó nada" };
    if ((input.otherReservasWithMp ?? []).some((id) => id !== r.id))
      return { ok: false, error: "El cobro ya está aplicado a otra reserva de turnera" };
  }
  if (isTurneraPaid(r)) return { ok: false, error: "La reserva ya figura pagada: no se registra un segundo pago" };
  return { ok: true, duplicate: false };
}
