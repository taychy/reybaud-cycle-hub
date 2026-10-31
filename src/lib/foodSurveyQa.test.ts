import { describe, expect, it } from "vitest";
import { normalizeFoodSurveyQa } from "./foodSurveyQa";

describe("private food survey QA", () => {
  it("never requests breakfast or meals without a real program", () => {
    const result = normalizeFoodSurveyQa({ tipo_alimentacion: "normal", tiene_alergias: false, comidas_solicitadas: [{ fecha: "2026-11-05", tipo: "almuerzo" }] }, false);
    expect(result.comidas_solicitadas).toEqual([]);
    expect(result.pension_interes).toBe(false);
  });
  it("never duplicates meals covered by pension", () => {
    expect(normalizeFoodSurveyQa({ tipo_alimentacion: "vegana", tiene_alergias: false, comidas_solicitadas: [{ fecha: "2026-11-09", tipo: "cena" }] }, true).comidas_solicitadas).toEqual([]);
  });
  it("requires allergy detail and explicit contamination answer", () => {
    expect(() => normalizeFoodSurveyQa({ tipo_alimentacion: "vegetariana", tiene_alergias: true, alergias_detalle: "Frutos secos" }, false)).toThrow();
    expect(normalizeFoodSurveyQa({ tipo_alimentacion: "vegetariana", tiene_alergias: true, alergias_detalle: "Frutos secos", contaminacion_cruzada: true }, false).alergias_detalle).toBe("Frutos secos");
  });
});