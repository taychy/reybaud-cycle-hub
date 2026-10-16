import { describe, it, expect } from "vitest";
import { foodSurveyStatus, validateFoodSurvey, normalizeFoodSurvey, suggestionFromHistory, isFoodSurveyEnabled } from "./foodSurvey";

describe("foodSurvey", () => {
  it("distingue sin respuesta de sin restricciones", () => {
    expect(foodSurveyStatus(null)).toBe("sin_respuesta");
    expect(foodSurveyStatus({ tipo_alimentacion: "normal" })).toBe("sin_respuesta");
    expect(foodSurveyStatus({ tipo_alimentacion: "normal", tiene_alergias: false })).toBe("sin_restricciones");
    expect(foodSurveyStatus({ tipo_alimentacion: "vegana", tiene_alergias: false })).toBe("con_restricciones");
    expect(foodSurveyStatus({ tipo_alimentacion: "normal", tiene_alergias: true })).toBe("con_restricciones");
  });

  it("exige detalle solo cuando aplica", () => {
    expect(Object.keys(validateFoodSurvey({ tipo_alimentacion: "normal", tiene_alergias: false }))).toEqual([]);
    const e = validateFoodSurvey({ tipo_alimentacion: "otra", tiene_alergias: true });
    expect(e.tipo_otra_detalle).toBeTruthy();
    expect(e.alergias_detalle).toBeTruthy();
    expect(e.contaminacion_cruzada).toBeTruthy();
  });

  it("no ofrece pensión si ya está incluida y limpia campos que no aplican", () => {
    const n = normalizeFoodSurvey({ tipo_alimentacion: "normal", tiene_alergias: false, alergias_detalle: "x", pension_interes: true }, true);
    expect(n.pension_interes).toBe(false);
    expect(n.alergias_detalle).toBeNull();
    expect(normalizeFoodSurvey({ pension_interes: true }, false).pension_interes).toBe(true);
  });

  it("convierte ficha histórica sin darla por confirmada", () => {
    const s = suggestionFromHistory("alimentacion", { dieta: "sin_gluten" });
    expect(s?.tipo_alimentacion).toBe("otra");
    expect(s?.tiene_alergias).toBe(true);
    expect(s?.historico_confirmado).toBeUndefined();
    expect(suggestionFromHistory("alimentacion", {})).toBeNull();
    expect(suggestionFromHistory("alimentacion", { dieta: "omnivoro" })?.tiene_alergias).toBeNull();
  });

  it("solo se habilita por metadata explícita", () => {
    expect(isFoodSurveyEnabled({ food_survey: { enabled: true } })).toBe(true);
    expect(isFoodSurveyEnabled({})).toBe(false);
  });
});
