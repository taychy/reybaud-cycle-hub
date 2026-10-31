import { variantesEquivalentes } from "./productQr";

export interface ReturnIdentity {
  productId: string;
  variante: Record<string, string>;
}

export function returnIdentityDiffers(actual: ReturnIdentity, expectedProductId?: string, expectedVariante?: Record<string, string> | null) {
  return Boolean((expectedProductId && actual.productId !== expectedProductId)
    || (expectedVariante && Object.keys(expectedVariante).length > 0 && !variantesEquivalentes(actual.variante, expectedVariante)));
}

export function validateReturnReceipt(actual: ReturnIdentity | null, expectedProductId?: string, expectedVariante?: Record<string, string> | null, reason = "", historicalStock = false) {
  if (!actual) return "Falta identificar la prenda devuelta";
  if (returnIdentityDiffers(actual, expectedProductId, expectedVariante)) {
    if (historicalStock) return "Hay un ingreso de stock anterior. La discrepancia requiere conciliación administrativa antes de recibir.";
    if (reason.trim().length < 3) return "Indicá el motivo de la discrepancia física";
  }
  return null;
}