/**
 * Política de pagos internacionales por evento (events.metadata.payment_policy).
 * Solo se activa si el evento la tiene; si no, todo sigue igual.
 * La obligación siempre queda en la moneda contractual (ej. EUR).
 * Una transferencia en ARS se calcula con la cotización central (venta Reybaud)
 * y recién después se suma el recargo, una sola vez.
 */
import type { FxBook } from "./fx";
import { fxArsPerUnit } from "./fx";

export interface EventPaymentPolicy {
  contract_currency: string;
  balance_currency: string;
  eur_cash_surcharge_pct: number;
  ars_transfer_surcharge_pct: number;
  fx_source: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function parsePaymentPolicy(metadata: unknown): EventPaymentPolicy | null {
  const raw = (metadata as any)?.payment_policy;
  if (!raw || typeof raw !== "object") return null;
  const contract = String(raw.contract_currency || "").toUpperCase();
  if (!contract) return null;
  const pct = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return {
    contract_currency: contract,
    balance_currency: String(raw.balance_currency || contract).toUpperCase(),
    eur_cash_surcharge_pct: pct(raw.eur_cash_surcharge_pct),
    ars_transfer_surcharge_pct: pct(raw.ars_transfer_surcharge_pct),
    fx_source: String(raw.fx_source || "current_app"),
  };
}

export interface ArsTransferQuote {
  /** Obligación contractual (no cambia). */
  obligationAmount: number;
  obligationCurrency: string;
  /** ARS por unidad contractual (venta Reybaud vigente). */
  referenceRate: number;
  baseArs: number;
  surchargePct: number;
  surchargeArs: number;
  totalArs: number;
}

/** Calcula el ARS a transferir para cubrir una obligación contractual. */
export function quoteArsTransfer(
  policy: EventPaymentPolicy,
  book: FxBook,
  obligationAmount: number,
): ArsTransferQuote {
  if (!(obligationAmount > 0)) throw new Error("Importe de obligación inválido");
  const referenceRate = fxArsPerUnit(book, policy.contract_currency, "sell");
  const baseArs = r2(obligationAmount * referenceRate);
  const surchargePct = policy.ars_transfer_surcharge_pct;
  const surchargeArs = r2(baseArs * surchargePct / 100);
  return {
    obligationAmount,
    obligationCurrency: policy.contract_currency,
    referenceRate,
    baseArs,
    surchargePct,
    surchargeArs,
    totalArs: r2(baseArs + surchargeArs),
  };
}

/**
 * Cotización ARS → moneda contractual a guardar en el pago.
 * El recargo NO se acredita como saldo: se descuenta antes de convertir.
 */
export function arsToContractRate(referenceRate: number, surchargePct: number): number {
  if (!(referenceRate > 0)) throw new Error("Cotización inválida");
  return 1 / (referenceRate * (1 + surchargePct / 100));
}

/** EUR que se acreditan por un pago ARS (sin contar el recargo). */
export function contractCreditFromArs(arsPaid: number, referenceRate: number, surchargePct: number): number {
  return r2(arsPaid * arsToContractRate(referenceRate, surchargePct));
}

/** Campos de trazabilidad para reservation_payments. */
export function buildArsTransferTrace(policy: EventPaymentPolicy, quote: ArsTransferQuote, arsPaid: number) {
  return {
    obligation_amount_contract: quote.obligationAmount,
    fx_reference_rate: quote.referenceRate,
    fx_base_amount: quote.baseArs,
    fx_surcharge_pct: quote.surchargePct,
    fx_surcharge_amount: quote.surchargeArs,
    exchange_rate_to_event_currency: arsToContractRate(quote.referenceRate, quote.surchargePct),
    equivalent_amount_event_currency: contractCreditFromArs(arsPaid, quote.referenceRate, quote.surchargePct),
    event_currency: policy.contract_currency,
    payment_policy_snapshot: policy,
  };
}
