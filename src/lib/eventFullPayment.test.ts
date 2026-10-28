import { describe, it, expect } from "vitest";
import { isFullPaymentRequired, amountDueAtBooking } from "./eventFullPayment";

describe("eventFullPayment", () => {
  it("solo aplica con el flag explícito en metadata", () => {
    expect(isFullPaymentRequired({ full_payment_required: true })).toBe(true);
    expect(isFullPaymentRequired({ full_payment_required: "true" })).toBe(false);
    expect(isFullPaymentRequired({})).toBe(false);
    expect(isFullPaymentRequired(null)).toBe(false);
  });
  it("con pago total se cobra el 100% aunque exista seña de 100.000", () => {
    expect(amountDueAtBooking(684860, 100000, true)).toBe(684860);
    expect(amountDueAtBooking(1039390, 100000, true)).toBe(1039390);
    expect(amountDueAtBooking(1196690, 100000, true)).toBe(1196690);
  });
  it("sin la política se mantiene la seña", () => {
    expect(amountDueAtBooking(684860, 100000, false)).toBe(100000);
    expect(amountDueAtBooking(684860, null, false)).toBe(684860);
  });
});
