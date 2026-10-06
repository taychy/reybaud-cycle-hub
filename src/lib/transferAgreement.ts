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
