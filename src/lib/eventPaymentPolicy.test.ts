import { describe, it, expect } from "vitest";
import {
  parsePaymentPolicy, quoteArsTransfer, contractCreditFromArs, arsToContractRate, buildArsTransferTrace,
} from "./eventPaymentPolicy";
import type { FxBook } from "./fx";

const book = {
  currencies: {
    EUR: { reference: 1000, buy: 1040, sell: 1110, buyMarginPct: 4, sellMarginPct: 11 },
    USD: { reference: 1000, buy: 1005, sell: 1035, buyMarginPct: 0.5, sellMarginPct: 3.5 },
    BRL: { reference: 200, buy: 199, sell: 222, buyMarginPct: -0.5, sellMarginPct: 11 },
  },
} as unknown as FxBook;

const meta = {
  payment_policy: {
    contract_currency: "EUR", balance_currency: "EUR",
    eur_cash_surcharge_pct: 0, ars_transfer_surcharge_pct: 7, fx_source: "current_app",
  },
};

describe("Política de pagos internacionales", () => {
  it("sin payment_policy no se activa", () => {
    expect(parsePaymentPolicy({})).toBeNull();
    expect(parsePaymentPolicy(null)).toBeNull();
  });

  it("calcula ARS con venta vigente + 7% una sola vez", () => {
    const p = parsePaymentPolicy(meta)!;
    const q = quoteArsTransfer(p, book, 100);
    expect(q.baseArs).toBe(111000);
    expect(q.surchargeArs).toBe(7770);
    expect(q.totalArs).toBe(118770);
    expect(q.obligationAmount).toBe(100);
    expect(q.obligationCurrency).toBe("EUR");
  });

  it("pagar el ARS cotizado acredita exactamente la obligación EUR (el 7% no suma saldo)", () => {
    const p = parsePaymentPolicy(meta)!;
    const q = quoteArsTransfer(p, book, 2284);
    expect(contractCreditFromArs(q.totalArs, q.referenceRate, q.surchargePct)).toBeCloseTo(2284, 1);
  });

  it("no aplica el recargo dos veces", () => {
    const p = parsePaymentPolicy(meta)!;
    const q = quoteArsTransfer(p, book, 100);
    // recotizar la misma obligación da el mismo total, no 7% sobre 7%
    expect(quoteArsTransfer(p, book, q.obligationAmount).totalArs).toBe(q.totalArs);
    expect(q.totalArs).not.toBeCloseTo(111000 * 1.07 * 1.07, 0);
  });

  it("la traza conserva obligación, cotización y recargo", () => {
    const p = parsePaymentPolicy(meta)!;
    const q = quoteArsTransfer(p, book, 100);
    const t = buildArsTransferTrace(p, q, q.totalArs);
    expect(t.obligation_amount_contract).toBe(100);
    expect(t.fx_reference_rate).toBe(1110);
    expect(t.fx_surcharge_pct).toBe(7);
    expect(t.fx_surcharge_amount).toBe(7770);
    expect(t.event_currency).toBe("EUR");
    expect(t.equivalent_amount_event_currency).toBeCloseTo(100, 2);
    expect(t.exchange_rate_to_event_currency).toBeCloseTo(arsToContractRate(1110, 7), 10);
  });
});
