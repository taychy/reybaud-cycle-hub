/**
 * Reglas puras para pagos de reservas editados por Administración.
 * - Elegir/cambiar la cuota a imputar NUNCA modifica monto, cotización ni equivalente.
 * - La rectificación por email solo corresponde cuando cambia el importe o la moneda.
 */

export interface AdminPayAmountFields {
  amount: string;
  rate: string;
  equivalent: string;
  override: boolean;
}

export interface InstallmentLike {
  id: string;
  balance_due?: number | string | null;
  amount?: number | string | null;
}

/** Applies an installment choice: only the imputation target changes. */
export function selectInstallment<T extends AdminPayAmountFields>(
  fields: T,
  newId: string | null,
): T & { installmentId: string | null } {
  return { ...fields, installmentId: newId };
}

/** Pending balance of an installment, only used as a visual hint. */
export function installmentPendingHint(inst: InstallmentLike | null | undefined): number | null {
  if (!inst) return null;
  const n = Number(inst.balance_due ?? inst.amount ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface PaymentFieldChange {
  field: string;
  old_val: string;
  new_val: string;
}

/** True only for real amount/currency corrections (not notes, date or method). */
export function requiresRectification(changes: PaymentFieldChange[]): boolean {
  return changes.some(
    (c) => (c.field === "amount" || c.field === "currency") && c.old_val !== c.new_val,
  );
}

export type RectificationOutcome =
  | { kind: "sent" }
  | { kind: "duplicate" }
  | { kind: "no_original" }
  | { kind: "failed"; message: string };

/** Interprets the server response without ever claiming a send that did not happen. */
export function interpretRectificationResponse(
  data: any,
  error: { message?: string } | null,
): RectificationOutcome {
  if (error) return { kind: "failed", message: error.message || "Error desconocido" };
  if (!data) return { kind: "failed", message: "Sin respuesta del servidor" };
  if (data.reason === "no_original_notification") return { kind: "no_original" };
  if (data.duplicate === true) return { kind: "duplicate" };
  if (data.email_sent === true) return { kind: "sent" };
  return { kind: "failed", message: data.email_error || data.error || "La rectificación no se pudo encolar" };
}
