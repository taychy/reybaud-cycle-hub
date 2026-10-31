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
import { parseQaParticipantView, qaDemoOffer, QA_PACKAGE_LABEL } from "./foodSurveyQa";
describe("vista participante QA", () => {
  it("solo acepta casos conocidos", () => {
    expect(parseQaParticipantView(new URLSearchParams("vista=participante&caso=sin_pension"))).toBe("sin_pension");
    expect(parseQaParticipantView(new URLSearchParams("vista=participante&caso=con_pension"))).toBe("con_pension");
    expect(parseQaParticipantView(new URLSearchParams("vista=participante&caso=otro"))).toBeNull();
    expect(parseQaParticipantView(new URLSearchParams("caso=sin_pension"))).toBeNull();
  });
  it("paquetes simulados", () => {
    expect(QA_PACKAGE_LABEL.sin_pension).toBe("Cabaña Triple");
    expect(QA_PACKAGE_LABEL.con_pension).toBe("Hab. doble con Pensión Completa");
  });
  it("programa ilustrativo: sin desayuno, ARS 35.000, nada con pensión", () => {
    const o = qaDemoOffer("sin_pension");
    expect(o.length).toBe(8);
    expect(o.every((m) => m.precio === 35000 && (m.tipo === "almuerzo" || m.tipo === "cena"))).toBe(true);
    expect(qaDemoOffer("con_pension")).toEqual([]);
  });
  it("las comidas ilustrativas nunca se guardan", () => {
    const d = normalizeFoodSurveyQa({ tipo_alimentacion: "omnivora", tiene_alergias: false, tiene_intolerancias: false, comidas_solicitadas: [{ fecha: "2026-11-06", tipo: "cena" }] } as any, false);
    expect(d.comidas_solicitadas ?? []).toEqual([]);
  });
});
