// Validación del acuerdo económico de transferencia de cupo (espejo de
// define_reservation_transfer_payment_agreement en SQL).
export type TransferMode = "direct_to_original" | "reybaud" | "mixed";

export interface TransferAgreementInput {
  mode: TransferMode;
  direct: number;
  toReybaud: number;
  refund: number;
  originalPaid: number;
}

export function validateTransferAgreement(i: TransferAgreementInput): string[] {
  const e: string[] = [];
  const direct = i.mode === "reybaud" ? 0 : i.direct;
  const refund = i.mode === "direct_to_original" ? 0 : i.refund;
  if ([i.direct, i.toReybaud, i.refund].some((n) => !Number.isFinite(n) || n < 0)) e.push("Los importes no pueden ser negativos.");
  if (i.mode === "direct_to_original" && direct <= 0) e.push("Indicá el monto que se paga directo al titular anterior.");
  if (i.mode === "mixed" && (direct <= 0 || (i.toReybaud <= 0 && refund <= 0))) e.push("Mixto: indicá parte directa y parte Reybaud.");
  if (refund > i.originalPaid) e.push("La devolución de Reybaud no puede superar lo pagado por el titular original.");
  if (direct + refund > i.originalPaid) e.push("Directo + devolución Reybaud superan lo pagado por el titular original.");
  return e;
}

export const transferModeLabel = (m?: string | null) =>
  m === "direct_to_original" ? "Reintegro directo por reemplazante"
  : m === "reybaud" ? "A devolver por Reybaud"
  : m === "mixed" ? "Mixto" : "Sin definir";

// Estado derivado: el acuerdo es solo referencia; el cumplimiento sale de pagos ejecutados.
export interface TransferExecution {
  status: string;
  agreementDefined: boolean;
  mode?: string | null;
  directAgreed: number;
  directConfirmed: number;
  effectiveBalance: number;
  paidToReybaud: number;
}

export function transferExecutionLabel(x: TransferExecution): string {
  if (x.status === "completed") return "Transferencia completada";
  if (!x.agreementDefined) return x.status === "reserved" ? "Esperando seña del nuevo comprador" : "Acuerdo de pago pendiente";
  const needsDirect = x.mode === "direct_to_original" || x.mode === "mixed";
  const directPending = needsDirect && x.directConfirmed < x.directAgreed;
  if (x.directConfirmed <= 0 && x.paidToReybaud <= 0) return "Acuerdo definido / pendiente de registrar pagos";
  if (directPending || x.effectiveBalance > 0) return "Pago parcial — pendiente de cumplimiento";
  return "Listo para cerrar";
}

export function canCompleteTransfer(x: TransferExecution, refundDone: boolean, refundRequired: boolean): boolean {
  if (!x.agreementDefined || x.status === "completed") return false;
  const needsDirect = x.mode === "direct_to_original" || x.mode === "mixed";
  if (needsDirect && x.directConfirmed < x.directAgreed) return false;
  if (x.effectiveBalance > 0) return false;
  if (refundRequired && !refundDone) return false;
  return true;
}

// Validación de un pago directo entre participantes (espejo del trigger
// validate_transfer_direct_payment). Rechaza importes con más de 2 decimales
// (p. ej. "840.925" escrito con punto de miles) y fechas con años absurdos.
export function validateDirectPaymentInput(rawAmount: string, date: string, today = new Date()): string[] {
  const e: string[] = [];
  const s = String(rawAmount ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s) || !(Number(s) > 0)) e.push("Importe inválido: sin puntos de miles y como máximo 2 decimales.");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  const max = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  if (!m || Number(m[1]) < 2020 || !d || d > max) e.push("Fecha de pago inválida.");
  return e;
}
