import { describe, it, expect } from "vitest";
import { validateTransferAgreement } from "./transferAgreement";

describe("validateTransferAgreement", () => {
  it("direct_to_original válido", () => {
    expect(validateTransferAgreement({ mode: "direct_to_original", direct: 500, toReybaud: 0, refund: 0, originalPaid: 500 })).toEqual([]);
  });
  it("direct sin monto es inválido", () => {
    expect(validateTransferAgreement({ mode: "direct_to_original", direct: 0, toReybaud: 0, refund: 0, originalPaid: 500 }).length).toBeGreaterThan(0);
  });
  it("mixed no permite doble reintegro", () => {
    expect(validateTransferAgreement({ mode: "mixed", direct: 300, toReybaud: 100, refund: 300, originalPaid: 500 }).length).toBeGreaterThan(0);
    expect(validateTransferAgreement({ mode: "mixed", direct: 300, toReybaud: 100, refund: 200, originalPaid: 500 })).toEqual([]);
  });
  it("reybaud ignora monto directo y limita la devolución", () => {
    expect(validateTransferAgreement({ mode: "reybaud", direct: 999, toReybaud: 0, refund: 400, originalPaid: 500 })).toEqual([]);
    expect(validateTransferAgreement({ mode: "reybaud", direct: 0, toReybaud: 0, refund: 600, originalPaid: 500 }).length).toBeGreaterThan(0);
  });
  it("rechaza negativos", () => {
    expect(validateTransferAgreement({ mode: "reybaud", direct: 0, toReybaud: -1, refund: 0, originalPaid: 500 }).length).toBeGreaterThan(0);
  });
});
