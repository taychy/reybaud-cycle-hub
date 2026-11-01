import { describe, expect, it } from "vitest";
import {
  NIGHT_SURVEY_OPTIONS,
  SAN_LUIS_EVENT_ID,
  SAN_LUIS_NIGHT_SURVEY_KEY,
  nightSurveyChoiceLabel,
  recordedNightFromExtras,
} from "./SanLuisAdditionalSurveys";

describe("encuesta de noches extras San Luis", () => {
  it("es independiente de la jornada extra y tiene cuatro elecciones claras", () => {
    expect(SAN_LUIS_EVENT_ID).toBe("67b4e85d-b00b-4b74-9644-99458d948c65");
    expect(SAN_LUIS_NIGHT_SURVEY_KEY).toBe("encuesta_noches_extra_san_luis");
    expect(NIGHT_SURVEY_OPTIONS.map((option) => option.value))
      .toEqual(["antes", "despues", "ambas", "ninguna"]);
  });

  it("usa etiquetas persistentes y no inventa noches", () => {
    expect(nightSurveyChoiceLabel("antes")).toBe("Sí, una noche antes");
    expect(nightSurveyChoiceLabel("ambas")).toBe("Sí, ambas noches");
    expect(nightSurveyChoiceLabel("ninguna")).toBe("No, gracias");
    expect(nightSurveyChoiceLabel(undefined)).toBe("Sin responder");
  });

  it("distingue una noche contratada de una encuesta pendiente", () => {
    const actual = recordedNightFromExtras({
      addons: [{ id: "night", nombre: "Noche extra individual", currency: "ARS" }],
      contracted: [{ id: "ra1", addon_id: "night", cantidad: 1, noche_timing: "antes", subtotal: 80000, currency: "ARS" }],
    });
    expect(actual).toEqual([{
      id: "ra1", nombre: "Noche extra individual", cantidad: 1,
      timing: "antes", amount: 80000, currency: "ARS",
    }]);
  });

  it("no confunde jersey u otros servicios con noche extra", () => {
    expect(recordedNightFromExtras({
      addons: [{ id: "jersey", nombre: "Jersey de ciclismo", currency: "ARS" }],
      contracted: [{ id: "ra2", addon_id: "jersey", cantidad: 1, noche_timing: null, subtotal: 50000 }],
    })).toEqual([]);
  });

  it("reconoce noches existentes aunque el catálogo de extras no las devuelva", () => {
    expect(recordedNightFromExtras({
      addons: [],
      contracted: [{ id: "ra3", addon_id: "old", cantidad: 2, noche_timing: "ambas", subtotal: 160000 }],
    })).toMatchObject([
      { id: "ra3", cantidad: 2, timing: "ambas", amount: 160000 },
    ]);
  });

  it("no presenta como contratado un extra sin cantidad", () => {
    expect(recordedNightFromExtras({
      addons: [{ id: "night", nombre: "Noche extra", currency: "ARS" }],
      contracted: [{ id: "ra4", addon_id: "night", cantidad: 0, noche_timing: "despues", subtotal: 0 }],
    })).toEqual([]);
  });
});
