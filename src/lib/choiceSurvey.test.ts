import { describe, it, expect } from "vitest";
import { choiceAnswerStatus, summarizeChoiceSurvey, getChoiceSurveys, isActiveReservation, type ChoiceSurveyConfig } from "./choiceSurvey";

const survey: ChoiceSurveyConfig = {
  key: "talle_camiseta", enabled: true, title: "t", question: "q",
  options: [
    { value: "XS", label: "XS" }, { value: "M", label: "M" }, { value: "XL", label: "XL" },
    { value: "no_seguro", label: "No estoy seguro/a", needs_follow_up: true },
  ],
};

describe("choiceSurvey", () => {
  it("sin respuesta no se asume ningún talle", () => {
    expect(choiceAnswerStatus(survey, null)).toBe("sin_respuesta");
    expect(choiceAnswerStatus(survey, {})).toBe("sin_respuesta");
  });
  it("'No estoy seguro/a' requiere confirmar y no cuenta como talle", () => {
    const s = summarizeChoiceSurvey(survey, [{ respuesta: "no_seguro" }, { respuesta: "M" }, null]);
    expect(s).toMatchObject({ total: 3, confirmados: 1, requiereConfirmar: 1, sinRespuesta: 1 });
    expect(s.porOpcion.find((o) => o.value === "no_seguro")).toBeUndefined();
    expect(s.porOpcion.find((o) => o.value === "M")?.count).toBe(1);
  });
  it("respuesta desconocida cuenta como no respondida", () => {
    expect(choiceAnswerStatus(survey, { respuesta: "XXXL" })).toBe("sin_respuesta");
  });
  it("solo encuestas habilitadas", () => {
    expect(getChoiceSurveys({ choice_surveys: [{ ...survey, enabled: false }] })).toHaveLength(0);
    expect(getChoiceSurveys({ choice_surveys: [survey] })).toHaveLength(1);
  });
  it("reservas canceladas no son válidas", () => {
    expect(isActiveReservation("cancelada")).toBe(false);
    expect(isActiveReservation("reserva_confirmada")).toBe(true);
  });
});
