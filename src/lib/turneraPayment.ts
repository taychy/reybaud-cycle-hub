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
  status?: string | null;
  direccion?: string | null;
  tipo?: string | null;
  /** pago_saldo_disponible('mp_movement', id) cuando se conoce. */
  saldo_disponible?: number | null;
}

/** Planes "por clase" que NUNCA deben generar una nueva mensualidad: se cobran en la reserva de turnera.
 *  Coincidencia exacta (no por contener "personalizada"): Asesoría Personalizada y packs siguen igual. */
const TURNERA_EVENTUAL_PLAN_NAMES = new Set(["clase personalizada", "clase personalizada cr"]);
export function isTurneraEventualPlanName(nombre: string | null | undefined): boolean {
  const n = String(nombre ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
  return TURNERA_EVENTUAL_PLAN_NAMES.has(n);
}

/** Filtro de opciones MP seleccionables en la UI (el servidor vuelve a validar). */
export function isSelectableTurneraMp(m: TurneraMpLike, reservaId: string): boolean {
  return m.status === "approved" && m.direccion === "ingreso" && (m.tipo ?? "payment") === "payment"
    && !!String(m.mp_payment_id ?? "").trim() && m.external_reference === `${TURNERA_REF_PREFIX}${reservaId}`
    && !m.suscripcion_id && !m.reservation_payment_id;
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
    if (!String(mp.mp_payment_id ?? "").trim()) return { ok: false, error: "El movimiento no tiene número de operación de Mercado Pago" };
    if (mp.status !== "approved") return { ok: false, error: "El cobro de Mercado Pago no está aprobado" };
    if (mp.direccion !== "ingreso") return { ok: false, error: "El movimiento no es un ingreso" };
    if ((mp.tipo ?? "payment") !== "payment") return { ok: false, error: "El movimiento no es un cobro (reintegro/liquidación)" };
    if (mp.external_reference !== `${TURNERA_REF_PREFIX}${r.id}`) return { ok: false, error: "El cobro no fue emitido para esta reserva de turnera" };
    if (mp.alumno_id && mp.alumno_id !== r.alumno_id) return { ok: false, error: "El cobro de Mercado Pago es de otro alumno" };
    if (String(mp.currency ?? "").toUpperCase() !== input.moneda.toUpperCase()) return { ok: false, error: "Moneda del cobro distinta" };
    if (Number(mp.amount ?? 0) < input.monto) return { ok: false, error: "El cobro no alcanza el importe de la reserva" };
    if (mp.suscripcion_id || mp.reservation_payment_id)
      return { ok: false, error: "El cobro ya está vinculado a otro destino: requiere revisión manual, no se modificó nada" };
    if ((input.otherReservasWithMp ?? []).some((id) => id !== r.id))
      return { ok: false, error: "El cobro ya está aplicado a otra reserva de turnera" };
    // Idempotencia solo después de validar el cobro.
    if (isTurneraPaid(r) && r.pago_mp_payment_id === mp.mp_payment_id) return { ok: true, duplicate: true };
    if (isTurneraPaid(r)) return { ok: false, error: "La reserva ya figura pagada: no se registra un segundo pago" };
    if ((mp.imputaciones_activas ?? 0) > 0)
      return { ok: false, error: "El cobro ya tiene imputaciones: riesgo de doble haber, no se modificó nada" };
    if (mp.saldo_disponible != null && mp.saldo_disponible < input.monto)
      return { ok: false, error: "El cobro no tiene saldo disponible suficiente (ya consumido)" };
  }
  if (isTurneraPaid(r)) return { ok: false, error: "La reserva ya figura pagada: no se registra un segundo pago" };
  return { ok: true, duplicate: false };
}
