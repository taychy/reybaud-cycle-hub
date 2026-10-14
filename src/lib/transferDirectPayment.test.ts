import { describe, it, expect } from "vitest";
import { validateDirectPaymentInput } from "./transferAgreement";

const today = new Date(2026, 9, 14);
describe("validateDirectPaymentInput", () => {
  it("acepta importe entero válido", () => expect(validateDirectPaymentInput("840000", "2026-10-05", today)).toEqual([]));
  it("acepta 2 decimales", () => expect(validateDirectPaymentInput("839243.99", "2026-10-08", today)).toEqual([]));
  it("rechaza punto de miles / 3+ decimales", () => {
    expect(validateDirectPaymentInput("840.925", "2026-10-05", today).length).toBe(1);
    expect(validateDirectPaymentInput("840.08408", "2026-10-05", today).length).toBe(1);
  });
  it("rechaza años absurdos y futuro", () => {
    expect(validateDirectPaymentInput("840000", "0026-10-05", today).length).toBe(1);
    expect(validateDirectPaymentInput("840000", "0206-10-08", today).length).toBe(1);
    expect(validateDirectPaymentInput("840000", "2026-12-01", today).length).toBe(1);
  });
  it("rechaza cero o vacío", () => expect(validateDirectPaymentInput("0", "2026-10-05", today).length).toBe(1));
});
