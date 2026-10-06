import { describe, it, expect } from "vitest";
import { transferExecutionLabel, canCompleteTransfer } from "./transferAgreement";

const base = { status: "payment_agreement_defined", agreementDefined: true, mode: "direct_to_original", directAgreed: 840925, directConfirmed: 0, effectiveBalance: 1196690, paidToReybaud: 0 };

describe("ejecución de transferencia", () => {
  it("acuerdo sin pagos no está cumplido (caso Ingrid/Fernando)", () => {
    expect(transferExecutionLabel(base)).toBe("Acuerdo definido / pendiente de registrar pagos");
    expect(canCompleteTransfer(base, false, false)).toBe(false);
  });
  it("pago directo parcial = pago parcial", () => {
    const x = { ...base, directConfirmed: 400000, effectiveBalance: 796690 };
    expect(transferExecutionLabel(x)).toMatch(/parcial/);
    expect(canCompleteTransfer(x, false, false)).toBe(false);
  });
  it("directo completo pero falta Reybaud bloquea cierre", () => {
    expect(canCompleteTransfer({ ...base, directConfirmed: 840925, effectiveBalance: 355765 }, false, false)).toBe(false);
  });
  it("todo cumplido permite cierre", () => {
    const x = { ...base, directConfirmed: 840925, paidToReybaud: 355765, effectiveBalance: 0 };
    expect(transferExecutionLabel(x)).toBe("Listo para cerrar");
    expect(canCompleteTransfer(x, false, false)).toBe(true);
  });
  it("devolución Reybaud pendiente bloquea", () => {
    expect(canCompleteTransfer({ ...base, mode: "reybaud", directAgreed: 0, effectiveBalance: 0, paidToReybaud: 1 }, false, true)).toBe(false);
  });
});
