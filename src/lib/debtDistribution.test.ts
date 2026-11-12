import { describe, expect, it } from "vitest";
import { summarizeDebtDistribution } from "./debtDistribution";

describe("summarizeDebtDistribution", () => {
  it("reparte un pago entre dos deudas sin exceder el ingreso", () => {
    const result = summarizeDebtDistribution(150000, 150000, [
      { key: "a", amount: "60000", maximum: 60000 },
      { key: "b", amount: "90000", maximum: 90000 },
    ]);
    expect(result.alreadyUsed).toBe(0);
    expect(result.allocated).toBe(150000);
    expect(result.remaining).toBe(0);
    expect(result.valid).toBe(true);
  });

  it("conserva el primer destino y admite solo el remanente legítimo", () => {
    const result = summarizeDebtDistribution(153552, 78750, [
      { key: "segunda", amount: "78750", maximum: 78750 },
    ]);
    expect(result.alreadyUsed).toBe(74802);
    expect(result.allocated).toBe(78750);
    expect(result.remaining).toBe(0);
    expect(result.valid).toBe(true);
  });

  it("acepta una distribución parcial y calcula el saldo restante", () => {
    const result = summarizeDebtDistribution(100000, 100000, [
      { key: "a", amount: "40000", maximum: 60000 },
    ]);
    expect(result.remaining).toBe(60000);
    expect(result.valid).toBe(true);
  });

  it("rechaza el exceso sobre el remanente", () => {
    const result = summarizeDebtDistribution(153552, 78750, [
      { key: "a", amount: "78751", maximum: 90000 },
    ]);
    expect(result.remaining).toBe(-1);
    expect(result.valid).toBe(false);
  });

  it("rechaza un importe mayor que la deuda seleccionada", () => {
    const result = summarizeDebtDistribution(100000, 100000, [
      { key: "a", amount: "60001", maximum: 60000 },
    ]);
    expect(result.valid).toBe(false);
  });
});
