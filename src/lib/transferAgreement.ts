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
