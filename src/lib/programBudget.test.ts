import { describe, expect, it } from "vitest";
import { calculateProgramBudget } from "./programBudget";

describe("calculateProgramBudget", () => {
  it("distribuye los costos presupuestados entre la base de inscriptos", () => {
    const result = calculateProgramBudget(
      [
        { cantidad: 8, costo_unitario: 40_000, costo_real: null },
        { cantidad: 1, costo_unitario: 45_000, costo_real: 23_500 },
      ],
      10,
      175_000,
    );

    expect(result.presupuestoTotal).toBe(365_000);
    expect(result.costoPorInscripto).toBe(36_500);
    expect(result.ingresosProyectados).toBe(1_750_000);
    expect(result.resultadoProyectado).toBe(1_385_000);
    expect(result.costoReal).toBe(23_500);
  });

  it("evita divisiones por cero", () => {
    const result = calculateProgramBudget(
      [{ cantidad: 1, costo_unitario: 45_000, costo_real: null }],
      0,
      0,
    );
    expect(result.costoPorInscripto).toBe(45_000);
  });
});
